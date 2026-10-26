import {
  conversationSchema,
  customerConversationSchema,
  events,
  queueSnapshotSchema,
  type Conversation,
  type CustomerConversation,
} from '@cove/shared'
import { io, type Socket } from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunningServer } from './server'
import { startServer } from './server'

describe('live handoff', () => {
  const running: RunningServer[] = []
  const sockets: Socket[] = []

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect()
    }
    for (const server of running.splice(0)) {
      await server.close()
    }
  })

  it('moves a shopper from Cove to an agent without leaking notes', async () => {
    const server = await startServer(0)
    running.push(server)
    const customer = connect(server.port)
    const agent = connect(server.port)
    sockets.push(customer, agent)

    await Promise.all([waitForConnect(customer), waitForConnect(agent)])
    agent.emit(events.deskJoin, { agentName: 'Maya Ellis' })

    const rawSnapshots: unknown[] = []
    customer.on(events.conversationSnapshot, (payload: unknown) => {
      rawSnapshots.push(payload)
    })

    const greeting = waitForCustomer(customer, (conversation) => conversation.messages.length > 0)
    customer.emit(events.conversationStart, { personaId: 'avery' })
    const opened = await greeting
    expect(opened.persona.order.id).toBe('NL-10482')

    const queued = waitForCustomer(customer, (conversation) => conversation.status === 'queued')
    const inboxPromise = waitForQueue(agent, (items) =>
      items.some(
        (item) => item.id === opened.id && item.handoffReason === 'Customer asked for a person',
      ),
    )
    customer.emit(events.messageSend, {
      conversationId: opened.id,
      text: 'Talk to a person',
    })
    const waiting = await queued
    expect(waiting.messages.some((message) => message.role === 'assistant')).toBe(true)

    const inbox = await inboxPromise
    expect(inbox.find((item) => item.id === opened.id)?.handoffReason).toBe(
      'Customer asked for a person',
    )

    const claimed = waitForAgent(
      agent,
      (conversation) => conversation.id === opened.id && conversation.assignee === 'Maya Ellis',
    )
    agent.emit(events.conversationClaim, {
      conversationId: opened.id,
      agentName: 'Maya Ellis',
    })
    const owned = await claimed
    expect(owned.notes).toEqual([])

    const noted = waitForAgent(
      agent,
      (conversation) => conversation.notes.some((note) => note.text.includes('intercept')),
    )
    agent.emit(events.conversationNote, {
      conversationId: opened.id,
      agentName: 'Maya Ellis',
      text: 'Asked UPS for an intercept.',
    })
    const withNote = await noted
    expect(withNote.messages.some((message) => message.text.includes('intercept'))).toBe(false)

    const replied = waitForCustomer(
      customer,
      (conversation) =>
        conversation.messages.some((message) => message.text === 'I can help with that intercept.'),
    )
    agent.emit(events.conversationReply, {
      conversationId: opened.id,
      agentName: 'Maya Ellis',
      text: 'I can help with that intercept.',
    })
    const seen = await replied
    expect(seen.messages.some((message) => message.role === 'agent')).toBe(true)
    expect(rawSnapshots.length).toBeGreaterThan(0)
    for (const payload of rawSnapshots) {
      expect(payload).not.toHaveProperty('notes')
    }

    const health = await fetch(`http://127.0.0.1:${server.port}/api/health`)
    expect(health.status).toBe(200)
  }, 15000)
})

/**
 * Opens a socket against the test server.
 *
 * @param port - Bound port.
 * @returns A client socket.
 */
function connect(port: number): Socket {
  return io(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  })
}

/**
 * Resolves when the socket connects.
 *
 * @param socket - Client socket.
 * @returns A promise that rejects if the connection stalls.
 */
function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket did not connect')), 4000)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * Waits for a shopper snapshot that matches.
 *
 * @param socket - Shopper socket.
 * @param predicate - Match condition.
 * @returns The parsed shopper thread.
 */
function waitForCustomer(
  socket: Socket,
  predicate: (conversation: CustomerConversation) => boolean,
): Promise<CustomerConversation> {
  return waitFor(socket, events.conversationSnapshot, (payload) => {
    const parsed = customerConversationSchema.safeParse(payload)
    if (!parsed.success || !predicate(parsed.data)) {
      return null
    }
    return parsed.data
  })
}

/**
 * Waits for a desk snapshot that matches.
 *
 * @param socket - Agent socket.
 * @param predicate - Match condition.
 * @returns The parsed full thread.
 */
function waitForAgent(
  socket: Socket,
  predicate: (conversation: Conversation) => boolean,
): Promise<Conversation> {
  return waitFor(socket, events.conversationSnapshot, (payload) => {
    const parsed = conversationSchema.safeParse(payload)
    if (!parsed.success || !predicate(parsed.data)) {
      return null
    }
    return parsed.data
  })
}

/**
 * Waits for a queue snapshot that matches.
 *
 * @param socket - Agent socket.
 * @param predicate - Match condition.
 * @returns The parsed queue.
 */
function waitForQueue(
  socket: Socket,
  predicate: (items: ReturnType<typeof queueSnapshotSchema.parse>) => boolean,
) {
  return waitFor(socket, events.queueSnapshot, (payload) => {
    const parsed = queueSnapshotSchema.safeParse(payload)
    if (!parsed.success || !predicate(parsed.data)) {
      return null
    }
    return parsed.data
  })
}

/**
 * Resolves with the first event payload a parser accepts.
 *
 * @param socket - Client socket.
 * @param eventName - Socket.io event.
 * @param parse - Returns a value to accept, or null to keep waiting.
 * @returns The accepted value.
 */
function waitFor<T>(
  socket: Socket,
  eventName: string,
  parse: (payload: unknown) => T | null,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent)
      reject(new Error(`timed out waiting for ${eventName}`))
    }, 4000)

    const onEvent = (payload: unknown) => {
      const parsed = parse(payload)
      if (parsed == null) {
        return
      }
      clearTimeout(timer)
      socket.off(eventName, onEvent)
      resolve(parsed)
    }

    socket.on(eventName, onEvent)
  })
}
