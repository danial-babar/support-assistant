import { z } from 'zod'

/**
 * Wire contract for Cove.
 * The server and both browser clients parse the same schemas, so a bad payload
 * fails closed instead of rendering a half-shaped conversation.
 */

/** Lifecycle of a support thread. */
export const conversationStatusSchema = z.enum(['bot', 'queued', 'active', 'resolved'])

/** Coarse tone signal used by the desk to sort the queue. */
export const toneSchema = z.enum(['calm', 'frustrated', 'positive'])

/** Help-center category shown on the storefront and in citations. */
export const articleCategorySchema = z.enum([
  'Orders',
  'Returns',
  'Billing',
  'Product',
  'Account',
])

/** Storefront category order. */
export const ARTICLE_CATEGORIES = articleCategorySchema.options

/** Who sent a transcript entry. */
export const messageRoleSchema = z.enum(['customer', 'assistant', 'agent', 'system'])

/** Latest order shown to the customer and the agent. */
export const orderSchema = z.object({
  id: z.string(),
  item: z.string(),
  detail: z.string(),
  status: z.string(),
  statusNote: z.string(),
  total: z.string(),
})

/**
 * Demo shopper.
 * Internal aliases and answer facts stay on the server and are stripped
 * before a persona is sent to the browser.
 */
export const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  city: z.string(),
  memberSince: z.string(),
  order: orderSchema,
  suggestedPrompts: z.array(z.string()),
})

/** Help article as the storefront is allowed to see it. */
export const publicArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: articleCategorySchema,
  summary: z.string(),
  prompt: z.string(),
})

/** Article Cove cited under a reply. */
export const citationSchema = z.object({
  id: z.string(),
  title: z.string(),
})

/** One line in the transcript or in the internal note list. */
export const messageSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  text: z.string(),
  createdAt: z.string(),
  authorName: z.string().nullable(),
  citations: z.array(citationSchema),
})

/** Article the responder leaned on, with a 0–1 score. */
export const retrievalSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  score: z.number(),
})

/** Full thread, including internal notes for the desk. */
export const conversationSchema = z.object({
  id: z.string(),
  persona: personaSchema,
  status: conversationStatusSchema,
  messages: z.array(messageSchema),
  notes: z.array(messageSchema),
  assignee: z.string().nullable(),
  handoffReason: z.string().nullable(),
  tone: toneSchema,
  retrieval: retrievalSchema.nullable(),
  confidence: z.number().nullable(),
  csat: z.number().int().min(1).max(5).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Thread sent to the shopper. Internal notes are not part of this schema. */
export const customerConversationSchema = conversationSchema.omit({ notes: true })

/** Row in the desk queue. */
export const queueItemSchema = z.object({
  id: z.string(),
  customerName: z.string(),
  city: z.string(),
  orderId: z.string(),
  item: z.string(),
  preview: z.string(),
  status: conversationStatusSchema,
  tone: toneSchema,
  assignee: z.string().nullable(),
  handoffReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Process health for the storefront badge. */
export const healthSchema = z.object({
  ok: z.literal(true),
  service: z.literal('cove'),
  modelEnabled: z.boolean(),
})

/** Counts derived from the in-memory inbox. */
export const metricsSchema = z.object({
  waiting: z.number(),
  active: z.number(),
  resolved: z.number(),
  bot: z.number(),
})

/** Typing pulse. The server fills `author`; clients only send the flag. */
export const typingSchema = z.object({
  conversationId: z.string(),
  author: z.enum(['customer', 'assistant', 'agent']),
  authorName: z.string(),
  isTyping: z.boolean(),
})

/** Short server message that is safe to show in the UI. */
export const noticeSchema = z.object({
  message: z.string(),
})

/** Agent display name entered on the desk. */
export const agentNameSchema = z.string().trim().min(1).max(40)

export const personaIdSchema = z.object({
  personaId: z.string().min(1),
})

export const resumeSchema = z.object({
  conversationId: z.string().min(1),
  personaId: z.string().min(1),
})

export const conversationWatchSchema = z.object({
  conversationId: z.string().min(1),
})

export const messageSendSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
})

export const deskJoinSchema = z.object({
  agentName: agentNameSchema,
})

export const claimSchema = z.object({
  conversationId: z.string().min(1),
  agentName: agentNameSchema,
})

export const agentTextSchema = claimSchema.extend({
  text: z.string().trim().min(1).max(2000),
})

export const csatSubmitSchema = z.object({
  conversationId: z.string().min(1),
  score: z.number().int().min(1).max(5),
})

export const typingClientSchema = z.object({
  conversationId: z.string().min(1),
  isTyping: z.boolean(),
})

export const personaListSchema = z.array(personaSchema)
export const articleListSchema = z.array(publicArticleSchema)
export const queueSnapshotSchema = z.array(queueItemSchema)

export type ConversationStatus = z.infer<typeof conversationStatusSchema>
export type Tone = z.infer<typeof toneSchema>
export type ArticleCategory = z.infer<typeof articleCategorySchema>
export type MessageRole = z.infer<typeof messageRoleSchema>
export type Order = z.infer<typeof orderSchema>
export type Persona = z.infer<typeof personaSchema>
export type PublicArticle = z.infer<typeof publicArticleSchema>
export type Citation = z.infer<typeof citationSchema>
export type Message = z.infer<typeof messageSchema>
export type Retrieval = z.infer<typeof retrievalSchema>
export type Conversation = z.infer<typeof conversationSchema>
export type CustomerConversation = z.infer<typeof customerConversationSchema>
export type QueueItem = z.infer<typeof queueItemSchema>
export type Health = z.infer<typeof healthSchema>
export type Metrics = z.infer<typeof metricsSchema>
export type TypingPulse = z.infer<typeof typingSchema>
export type Notice = z.infer<typeof noticeSchema>

/**
 * Drops internal notes so a shopper payload cannot carry them.
 *
 * @param conversation - Full thread stored on the server.
 * @returns The same thread without notes.
 */
export function toCustomerConversation(conversation: Conversation): CustomerConversation {
  return customerConversationSchema.parse(conversation)
}
