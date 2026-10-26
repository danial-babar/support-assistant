import countBy from 'lodash/countBy'
import findLast from 'lodash/findLast'
import orderBy from 'lodash/orderBy'
import truncate from 'lodash/truncate'
import {
  conversationSchema,
  personaSchema,
  type Citation,
  type Conversation,
  type ConversationStatus,
  type Message,
  type Metrics,
  type QueueItem,
  type Retrieval,
} from '@cove/shared'
import { getPersona, listPublicPersonas } from './personas'
import { detectTone } from './tone'

/** Extra fields stored when Cove answers. */
export interface AssistantMeta {
  readonly citations: readonly Citation[]
  readonly retrieval: Retrieval | null
  readonly confidence: number
}

const STATUS_RANK: Record<ConversationStatus, number> = {
  queued: 0,
  active: 1,
  bot: 2,
  resolved: 3,
}

/**
 * In-memory inbox.
 * A process restart clears it. That is deliberate for a portfolio demo:
 * there is no database to configure, and transcripts never leave the process.
 */
export class ConversationStore {
  private readonly conversations = new Map<string, Conversation>()

  /**
   * Opens a thread for a demo shopper and greets them from Cove.
   *
   * @param personaId - Storefront persona id.
   * @returns The new thread.
   */
  create(personaId: string): Conversation {
    const persona = getPersona(personaId)
    if (!persona) {
      throw new Error('Choose a demo customer before starting a chat.')
    }
    const publicPersona = personaSchema.parse(persona)
    const timestamp = nowIso()
    const firstName = publicPersona.name.split(' ')[0] ?? publicPersona.name
    const conversation = conversationSchema.parse({
      id: createId('conv'),
      persona: publicPersona,
      status: 'bot',
      messages: [
        createMessage(
          'assistant',
          `Hi ${firstName} — I'm Cove. I can see ${publicPersona.order.item} on order ${publicPersona.order.id}, and I can read Northline's help notes. Ask a question, or tell me if you want a person from the desk.`,
          'Cove',
        ),
      ],
      notes: [],
      assignee: null,
      handoffReason: null,
      tone: 'calm',
      retrieval: null,
      confidence: null,
      csat: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    this.conversations.set(conversation.id, conversation)
    return conversation
  }

  /**
   * Reads a thread without letting callers mutate the stored copy.
   *
   * @param conversationId - Thread id.
   * @returns A copy of the thread, or `undefined` when it is gone.
   */
  get(conversationId: string): Conversation | undefined {
    const conversation = this.conversations.get(conversationId)
    return conversation ? conversationSchema.parse(conversation) : undefined
  }

  /**
   * Returns a thread only when it belongs to the given shopper.
   *
   * @param conversationId - Thread id from the browser.
   * @param personaId - Shopper currently selected on the storefront.
   * @returns The thread, or `undefined` when the pair does not match.
   */
  resume(conversationId: string, personaId: string): Conversation | undefined {
    const conversation = this.get(conversationId)
    if (!conversation || conversation.persona.id !== personaId) {
      return undefined
    }
    return conversation
  }

  /**
   * Lists public shoppers. Present so HTTP does not import the catalog shape.
   *
   * @returns Demo shoppers safe to send to the browser.
   */
  personas() {
    return listPublicPersonas()
  }

  /**
   * Appends a shopper message and refreshes the tone signal.
   *
   * @param conversationId - Thread id.
   * @param text - Trimmed message.
   * @returns The updated thread.
   */
  addCustomerMessage(conversationId: string, text: string): Conversation {
    const conversation = this.require(conversationId)
    if (conversation.status === 'resolved') {
      throw new Error('This conversation is resolved. Start a new chat.')
    }
    return this.save({
      ...conversation,
      tone: detectTone(text, conversation.tone),
      updatedAt: nowIso(),
      messages: [
        ...conversation.messages,
        createMessage('customer', text, conversation.persona.name),
      ],
    })
  }

  /**
   * Appends Cove's reply and records the retrieval the desk should show.
   *
   * @param conversationId - Thread id.
   * @param text - Grounded reply.
   * @param meta - Citations, score, and confidence.
   * @returns The updated thread.
   */
  addAssistantMessage(conversationId: string, text: string, meta: AssistantMeta): Conversation {
    const conversation = this.require(conversationId)
    return this.save({
      ...conversation,
      retrieval: meta.retrieval,
      confidence: meta.confidence,
      updatedAt: nowIso(),
      messages: [...conversation.messages, createMessage('assistant', text, 'Cove', meta.citations)],
    })
  }

  /**
   * Appends a reply from the assigned person.
   *
   * @param conversationId - Thread id.
   * @param text - Agent reply.
   * @param agentName - Name that must match the assignee.
   * @returns The updated thread.
   */
  addAgentMessage(conversationId: string, text: string, agentName: string): Conversation {
    const conversation = this.requireActiveAssignee(conversationId, agentName)
    return this.save({
      ...conversation,
      updatedAt: nowIso(),
      messages: [...conversation.messages, createMessage('agent', text, agentName)],
    })
  }

  /**
   * Stores an internal note. Notes are not part of the shopper transcript.
   *
   * @param conversationId - Thread id.
   * @param text - Note body.
   * @param agentName - Author. Must be the assignee.
   * @returns The updated thread.
   */
  addNote(conversationId: string, text: string, agentName: string): Conversation {
    const conversation = this.requireActiveAssignee(conversationId, agentName)
    return this.save({
      ...conversation,
      updatedAt: nowIso(),
      notes: [...conversation.notes, createMessage('agent', text, agentName)],
    })
  }

  /**
   * Moves a bot thread into the human queue.
   * Repeated calls do not add a second system line.
   *
   * @param conversationId - Thread id.
   * @param reason - Short reason for the sidebar.
   * @returns The updated thread.
   */
  markQueued(conversationId: string, reason: string): Conversation {
    const conversation = this.require(conversationId)
    if (conversation.status === 'queued' || conversation.status === 'active') {
      return conversation
    }
    if (conversation.status === 'resolved') {
      throw new Error('This conversation is already resolved.')
    }
    return this.save({
      ...conversation,
      status: 'queued',
      handoffReason: reason,
      updatedAt: nowIso(),
      messages: [
        ...conversation.messages,
        createMessage('system', 'Waiting for a teammate on the Northline desk.', null),
      ],
    })
  }

  /**
   * Assigns the thread to a person. A second person cannot take it over.
   *
   * @param conversationId - Thread id.
   * @param agentName - Desk display name.
   * @returns The updated thread.
   */
  claim(conversationId: string, agentName: string): Conversation {
    const conversation = this.require(conversationId)
    if (conversation.status === 'resolved') {
      throw new Error('This conversation is already resolved.')
    }
    if (
      conversation.status === 'active' &&
      conversation.assignee &&
      conversation.assignee !== agentName
    ) {
      throw new Error(`${conversation.persona.name} is already with ${conversation.assignee}.`)
    }
    const alreadyMine = conversation.status === 'active' && conversation.assignee === agentName
    return this.save({
      ...conversation,
      status: 'active',
      assignee: agentName,
      updatedAt: nowIso(),
      messages: alreadyMine
        ? conversation.messages
        : [...conversation.messages, createMessage('system', `${agentName} joined the chat.`, null)],
    })
  }

  /**
   * Closes the thread. Only the assignee can resolve it.
   *
   * @param conversationId - Thread id.
   * @param agentName - Desk display name.
   * @returns The updated thread.
   */
  resolve(conversationId: string, agentName: string): Conversation {
    const conversation = this.requireActiveAssignee(conversationId, agentName)
    return this.save({
      ...conversation,
      status: 'resolved',
      updatedAt: nowIso(),
      messages: [
        ...conversation.messages,
        createMessage('system', `${agentName} marked this resolved.`, null),
      ],
    })
  }

  /**
   * Records a shopper rating after resolution. The first score sticks.
   *
   * @param conversationId - Thread id.
   * @param score - Whole number from 1 to 5.
   * @returns The updated thread.
   */
  setCsat(conversationId: string, score: number): Conversation {
    const conversation = this.require(conversationId)
    if (conversation.status !== 'resolved') {
      throw new Error('Resolve the conversation before rating it.')
    }
    if (conversation.csat != null) {
      return conversation
    }
    return this.save({
      ...conversation,
      csat: score,
      updatedAt: nowIso(),
    })
  }

  /**
   * Builds the desk inbox. Waiting and frustrated threads sort first.
   *
   * @returns Queue rows, newest activity first inside each band.
   */
  listQueue(): QueueItem[] {
    const items = [...this.conversations.values()].map((conversation) => toQueueItem(conversation))
    return orderBy(
      items,
      [
        (item) => STATUS_RANK[item.status],
        (item) => (item.tone === 'frustrated' ? 0 : 1),
        (item) => item.updatedAt,
      ],
      ['asc', 'asc', 'desc'],
    )
  }

  /**
   * Counts threads by status for the health of the inbox.
   *
   * @returns Waiting, active, resolved, and bot counts.
   */
  metrics(): Metrics {
    const counts = countBy([...this.conversations.values()], (conversation) => conversation.status)
    return {
      waiting: counts.queued ?? 0,
      active: counts.active ?? 0,
      resolved: counts.resolved ?? 0,
      bot: counts.bot ?? 0,
    }
  }

  /**
   * Loads a thread or throws a shopper-safe error.
   *
   * @param conversationId - Thread id.
   * @returns The stored thread.
   */
  private require(conversationId: string): Conversation {
    const conversation = this.get(conversationId)
    if (!conversation) {
      throw new Error('That conversation is no longer available. Start a new chat.')
    }
    return conversation
  }

  /**
   * Loads a live thread assigned to this person.
   *
   * @param conversationId - Thread id.
   * @param agentName - Desk display name.
   * @returns The thread when the assignee matches.
   */
  private requireActiveAssignee(conversationId: string, agentName: string): Conversation {
    const conversation = this.require(conversationId)
    if (conversation.status !== 'active' || conversation.assignee !== agentName) {
      throw new Error('Claim this conversation before replying.')
    }
    return conversation
  }

  /**
   * Validates and stores the next copy of a thread.
   *
   * @param conversation - Next thread state.
   * @returns The parsed thread now in the map.
   */
  private save(conversation: Conversation): Conversation {
    const parsed = conversationSchema.parse(conversation)
    this.conversations.set(parsed.id, parsed)
    return parsed
  }
}

/**
 * Builds a queue row from a thread.
 *
 * @param conversation - Stored thread.
 * @returns The inbox summary.
 */
function toQueueItem(conversation: Conversation): QueueItem {
  const latest = findLast(conversation.messages, (message) => message.role !== 'system')
  return {
    id: conversation.id,
    customerName: conversation.persona.name,
    city: conversation.persona.city,
    orderId: conversation.persona.order.id,
    item: conversation.persona.order.item,
    preview: truncate(latest?.text ?? 'New conversation', { length: 90, omission: '…' }),
    status: conversation.status,
    tone: conversation.tone,
    assignee: conversation.assignee,
    handoffReason: conversation.handoffReason,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  }
}

/**
 * Creates a transcript entry.
 *
 * @param role - Who sent it.
 * @param text - Body.
 * @param authorName - Display name, or null for system lines.
 * @param citations - Help notes to show under the message.
 * @returns A message with a fresh id and timestamp.
 */
function createMessage(
  role: Message['role'],
  text: string,
  authorName: string | null,
  citations: readonly Citation[] = [],
): Message {
  return {
    id: createId('msg'),
    role,
    text,
    createdAt: nowIso(),
    authorName,
    citations: [...citations],
  }
}

/**
 * Builds a prefixed id.
 *
 * @param prefix - Short type prefix.
 * @returns A unique id.
 */
function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

/**
 * Returns the current time as an ISO string.
 *
 * @returns Timestamp for `createdAt` and `updatedAt`.
 */
function nowIso(): string {
  return new Date().toISOString()
}
