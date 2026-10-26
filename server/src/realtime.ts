import {
  agentTextSchema,
  claimSchema,
  conversationWatchSchema,
  csatSubmitSchema,
  deskJoinSchema,
  events,
  messageSendSchema,
  personaIdSchema,
  resumeSchema,
  toCustomerConversation,
  typingClientSchema,
  type Conversation,
  type TypingPulse,
} from '@cove/shared'
import type { Server } from 'socket.io'
import { z } from 'zod'
import { config } from './config'
import { delay } from './delay'
import { polishReply } from './llm'
import { getPersona } from './personas'
import { decideReply } from './responder'
import type { ConversationStore } from './store'

/** Who a socket is allowed to act as. */
interface ConnectionMeta {
  readonly role: 'customer' | 'agent'
  readonly agentName?: string
  readonly conversationId?: string
}

/**
 * Attaches the inbox to Socket.io.
 * Shoppers receive transcripts without internal notes. The desk room receives
 * the full thread and the queue.
 *
 * @param io - Socket.io server bound to the HTTP server.
 * @param store - Inbox for this process.
 */
export function registerRealtime(io: Server, store: ConversationStore): void {
  const customers = new Map<string, Set<string>>()
  const connections = new Map<string, ConnectionMeta>()
  const lanes = new Map<string, Promise<void>>()

  /**
   * Runs bot work for one thread in order, without blocking other threads.
   *
   * @param conversationId - Thread to serialize.
   * @param task - Work that may delay while Cove "types".
   * @returns The task promise. Failures do not jam the next message.
   */
  function lane(conversationId: string, task: () => Promise<void>): Promise<void> {
    const previous = lanes.get(conversationId) ?? Promise.resolve()
    const next = previous.then(task, task)
    lanes.set(
      conversationId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    )
    return next
  }

  /**
   * Sends the right view of a thread to the shopper and to the desk.
   *
   * @param conversation - Latest thread.
   */
  function publish(conversation: Conversation): void {
    const customerView = toCustomerConversation(conversation)
    for (const socketId of customers.get(conversation.id) ?? []) {
      io.to(socketId).emit(events.conversationSnapshot, customerView)
    }
    io.to('desk').emit(events.conversationSnapshot, conversation)
    io.to('desk').emit(events.queueSnapshot, store.listQueue())
  }

  /**
   * Broadcasts a typing pulse to the other side of the thread.
   *
   * @param pulse - Who is typing, and whether they stopped.
   */
  function publishTyping(pulse: TypingPulse): void {
    if (pulse.author === 'customer') {
      io.to('desk').emit(events.typing, pulse)
      return
    }
    for (const socketId of customers.get(pulse.conversationId) ?? []) {
      io.to(socketId).emit(events.typing, pulse)
    }
    if (pulse.author === 'assistant') {
      io.to('desk').emit(events.typing, pulse)
    }
  }

  /**
   * Remembers which thread a shopper socket should receive.
   *
   * @param socketId - Connected socket.
   * @param conversationId - Thread they may see.
   */
  function attachCustomer(socketId: string, conversationId: string): void {
    for (const [id, sockets] of customers) {
      sockets.delete(socketId)
      if (sockets.size === 0) {
        customers.delete(id)
      }
    }
    const sockets = customers.get(conversationId) ?? new Set<string>()
    sockets.add(socketId)
    customers.set(conversationId, sockets)
    connections.set(socketId, { role: 'customer', conversationId })
  }

  /**
   * Answers from policy when Cove still owns the thread.
   *
   * @param conversationId - Thread that just received a shopper message.
   * @param text - The shopper message.
   */
  async function respondAsCove(conversationId: string, text: string): Promise<void> {
    const current = store.get(conversationId)
    if (!current || current.status !== 'bot') {
      return
    }
    const persona = getPersona(current.persona.id)
    if (!persona) {
      return
    }

    const decision = decideReply(text, persona)
    publishTyping({
      conversationId,
      author: 'assistant',
      authorName: 'Cove',
      isTyping: true,
    })

    try {
      await delay(config.replyDelayMs)
      const afterDelay = store.get(conversationId)
      if (!afterDelay || afterDelay.status !== 'bot') {
        return
      }
      const reply = decision.handoff ? decision.text : await polishReply(decision.text)
      let updated = store.addAssistantMessage(conversationId, reply, {
        citations: decision.citations,
        retrieval: decision.retrieval,
        confidence: decision.confidence,
      })
      if (decision.handoff && decision.handoffReason) {
        updated = store.markQueued(conversationId, decision.handoffReason)
      }
      publish(updated)
    } finally {
      publishTyping({
        conversationId,
        author: 'assistant',
        authorName: 'Cove',
        isTyping: false,
      })
    }
  }

  io.on('connection', (socket) => {
    /**
     * Parses a payload or throws a short UI-safe error.
     *
     * @param schema - Expected body.
     * @param payload - Raw socket data.
     * @returns The parsed body.
     */
    function read<T>(schema: z.ZodType<T>, payload: unknown): T {
      const result = schema.safeParse(payload)
      if (!result.success) {
        throw new Error('Check that message and try again.')
      }
      return result.data
    }

    /**
     * Runs a handler and reports failures as notices, not socket errors.
     *
     * @param handler - Event work.
     * @returns A Socket.io listener.
     */
    function guard(handler: (payload: unknown) => Promise<void> | void) {
      return (payload: unknown) => {
        Promise.resolve(handler(payload)).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Something went wrong.'
          socket.emit(events.notice, { message })
        })
      }
    }

    socket.on(
      events.conversationStart,
      guard((payload) => {
        const { personaId } = read(personaIdSchema, payload)
        const conversation = store.create(personaId)
        attachCustomer(socket.id, conversation.id)
        publish(conversation)
      }),
    )

    socket.on(
      events.conversationResume,
      guard((payload) => {
        const body = read(resumeSchema, payload)
        const existing = store.resume(body.conversationId, body.personaId)
        const conversation = existing ?? store.create(body.personaId)
        attachCustomer(socket.id, conversation.id)
        publish(conversation)
      }),
    )

    socket.on(
      events.deskJoin,
      guard((payload) => {
        const { agentName } = read(deskJoinSchema, payload)
        connections.set(socket.id, { role: 'agent', agentName })
        socket.join('desk')
        socket.emit(events.queueSnapshot, store.listQueue())
      }),
    )

    socket.on(
      events.conversationWatch,
      guard((payload) => {
        assertAgent(socket.id, connections)
        const { conversationId } = read(conversationWatchSchema, payload)
        const conversation = store.get(conversationId)
        if (!conversation) {
          throw new Error('That conversation is no longer available.')
        }
        socket.emit(events.conversationSnapshot, conversation)
      }),
    )

    socket.on(
      events.messageSend,
      guard((payload) => {
        const body = read(messageSendSchema, payload)
        assertCustomer(socket.id, body.conversationId, connections)
        return lane(body.conversationId, async () => {
          publishTyping({
            conversationId: body.conversationId,
            author: 'customer',
            authorName: 'Customer',
            isTyping: false,
          })
          const updated = store.addCustomerMessage(body.conversationId, body.text)
          publish(updated)
          await respondAsCove(body.conversationId, body.text)
        })
      }),
    )

    socket.on(
      events.handoffRequest,
      guard((payload) => {
        const body = read(conversationWatchSchema, payload)
        assertCustomer(socket.id, body.conversationId, connections)
        return lane(body.conversationId, async () => {
          const current = store.get(body.conversationId)
          if (!current || current.status !== 'bot') {
            return
          }
          const withReply = store.addAssistantMessage(
            body.conversationId,
            "I'll bring a person from the Northline desk into this chat. They'll see everything above.",
            { citations: [], retrieval: null, confidence: 1 },
          )
          publish(withReply)
          publish(store.markQueued(body.conversationId, 'Customer asked for a person'))
        })
      }),
    )

    socket.on(
      events.typing,
      guard((payload) => {
        const body = read(typingClientSchema, payload)
        const meta = connections.get(socket.id)
        if (!meta) {
          return
        }
        if (meta.role === 'customer') {
          assertCustomer(socket.id, body.conversationId, connections)
          const conversation = store.get(body.conversationId)
          publishTyping({
            conversationId: body.conversationId,
            author: 'customer',
            authorName: conversation?.persona.name ?? 'Customer',
            isTyping: body.isTyping,
          })
          return
        }
        if (!meta.agentName) {
          return
        }
        publishTyping({
          conversationId: body.conversationId,
          author: 'agent',
          authorName: meta.agentName,
          isTyping: body.isTyping,
        })
      }),
    )

    socket.on(
      events.csatSubmit,
      guard((payload) => {
        const body = read(csatSubmitSchema, payload)
        assertCustomer(socket.id, body.conversationId, connections)
        publish(store.setCsat(body.conversationId, body.score))
      }),
    )

    socket.on(
      events.conversationClaim,
      guard((payload) => {
        const body = read(claimSchema, payload)
        assertAgent(socket.id, connections)
        publish(store.claim(body.conversationId, body.agentName))
      }),
    )

    socket.on(
      events.conversationReply,
      guard((payload) => {
        const body = read(agentTextSchema, payload)
        assertAgent(socket.id, connections)
        publishTyping({
          conversationId: body.conversationId,
          author: 'agent',
          authorName: body.agentName,
          isTyping: false,
        })
        publish(store.addAgentMessage(body.conversationId, body.text, body.agentName))
      }),
    )

    socket.on(
      events.conversationNote,
      guard((payload) => {
        const body = read(agentTextSchema, payload)
        assertAgent(socket.id, connections)
        publish(store.addNote(body.conversationId, body.text, body.agentName))
      }),
    )

    socket.on(
      events.conversationResolve,
      guard((payload) => {
        const body = read(claimSchema, payload)
        assertAgent(socket.id, connections)
        publish(store.resolve(body.conversationId, body.agentName))
      }),
    )

    socket.on('disconnect', () => {
      const meta = connections.get(socket.id)
      connections.delete(socket.id)
      if (!meta?.conversationId) {
        return
      }
      const sockets = customers.get(meta.conversationId)
      sockets?.delete(socket.id)
      if (sockets && sockets.size === 0) {
        customers.delete(meta.conversationId)
      }
    })
  })
}

/**
 * Ensures the socket joined as an agent.
 *
 * @param socketId - Caller.
 * @param connections - Role map.
 */
function assertAgent(socketId: string, connections: Map<string, ConnectionMeta>): void {
  if (connections.get(socketId)?.role !== 'agent') {
    throw new Error('Join the desk before using agent actions.')
  }
}

/**
 * Ensures the socket is the shopper on this thread.
 *
 * @param socketId - Caller.
 * @param conversationId - Thread they are acting on.
 * @param connections - Role map.
 */
function assertCustomer(
  socketId: string,
  conversationId: string,
  connections: Map<string, ConnectionMeta>,
): void {
  const meta = connections.get(socketId)
  if (meta?.role !== 'customer' || meta.conversationId !== conversationId) {
    throw new Error('That chat is not open on this connection.')
  }
}
