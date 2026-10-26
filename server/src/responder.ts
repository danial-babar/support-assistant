import type { Citation, Retrieval } from '@cove/shared'
import type { Article } from './knowledge-base'
import { articles } from './knowledge-base'
import type { InternalPersona } from './personas'
import { rankArticles } from './retrieval'

/** Minimum coverage required before Cove answers from a help note. */
export const ANSWER_THRESHOLD = 0.5

/** What the socket layer should do with one customer message. */
export interface ReplyDecision {
  readonly text: string
  readonly handoff: boolean
  readonly handoffReason: string | null
  readonly citations: readonly Citation[]
  readonly confidence: number
  readonly retrieval: Retrieval | null
}

const HANDOFF_PATTERN =
  /\b(human|real person|representative|customer service|talk to (a )?(person|someone|human)|speak to (a )?(person|someone)|person please)\b/i

const GREETING_PATTERN = /^(hi|hey|hello|good morning|good afternoon)[!.\s]*$/i
const THANKS_PATTERN = /^(thanks|thank you|thx)[!.\s]*$/i

const PERSONAL_ORDER_PATTERN =
  /\b(my order|my package|where is my|track my|order status|has not arrived|hasn't arrived|not arrived)\b/i

const ORDER_WORDS = /\b(where|track|tracking|status|shipped|delivery|arrive|package)\b/i
const RETURN_WORDS = /\b(return|exchange|refund)\b/i
const BILLING_WORDS = /\b(charged|billing|invoice|renew|membership|duplicate|promo|coupon|code)\b/i

/**
 * Decides a grounded reply or a handoff.
 * Order lookup, return eligibility, and billing notes are code. The help
 * catalog fills general questions. Low coverage queues a person instead of
 * guessing. A model, when configured, may only rewrite the text later.
 *
 * @param text - Customer message, already trimmed.
 * @param persona - Shopper the thread belongs to.
 * @param catalog - Help notes. Defaults to the Northline catalog.
 * @returns The reply decision. It does not write to the store.
 */
export function decideReply(
  text: string,
  persona: InternalPersona,
  catalog: readonly Article[] = articles,
): ReplyDecision {
  const trimmed = text.trim()
  const firstName = persona.name.split(' ')[0] ?? persona.name

  if (HANDOFF_PATTERN.test(trimmed)) {
    return handoff(
      `I'll bring a person from the Northline desk into this chat. They can see the order and everything written above, so you don't need to repeat it.`,
      'Customer asked for a person',
    )
  }

  if (GREETING_PATTERN.test(trimmed)) {
    return answer(
      `Hi ${firstName}. I can see ${persona.order.item} on ${persona.order.id}. Ask me about that order, or say if you want a person.`,
      0.99,
    )
  }

  if (THANKS_PATTERN.test(trimmed)) {
    return answer(
      `Glad that helped. I'm here if ${persona.order.id} does something unexpected.`,
      0.99,
    )
  }

  if (isPersonalOrder(trimmed, persona)) {
    const article = findArticle(catalog, 'track-an-order')
    return answer(persona.facts.order, 0.94, article)
  }

  if (isPersonalReturn(trimmed, persona)) {
    const article = findArticle(catalog, 'returns-30-days')
    const exchange = findArticle(catalog, 'exchanges')
    const chosen = RETURN_WORDS.test(trimmed) && /\bexchange\b/i.test(trimmed) ? exchange : article
    return answer(compose(persona.facts.returns, chosen), 0.9, chosen)
  }

  if (isPersonalBilling(trimmed, persona)) {
    const askingAboutCode = /\b(promo|coupon|code)\b/i.test(trimmed)
    const article = findArticle(catalog, askingAboutCode ? 'promo-codes' : 'trail-club-billing')
    if (!askingAboutCode && persona.facts.billing) {
      return answer(compose(persona.facts.billing, article), 0.92, article)
    }
    const lead = askingAboutCode
      ? null
      : `I don't see a duplicate or membership charge on ${firstName}'s account.`
    return answer(compose(lead, article), askingAboutCode ? 0.86 : 0.8, article)
  }

  const [best] = rankArticles(trimmed, catalog)
  if (best && best.score >= ANSWER_THRESHOLD) {
    return answer(compose(null, best.article), best.score, best.article, best.score)
  }

  return handoff(
    `That's outside what I can answer cleanly from Northline's help notes. I'm queuing a person from the desk so you aren't stuck with a guess.`,
    'Question was outside the help notes',
  )
}

/**
 * True when the message is about this shopper's shipment.
 *
 * @param text - Customer message.
 * @param persona - Shopper record.
 * @returns Whether to answer from the order fact.
 */
function isPersonalOrder(text: string, persona: InternalPersona): boolean {
  if (PERSONAL_ORDER_PATTERN.test(text)) {
    return true
  }
  return mentionsPersona(text, persona) && ORDER_WORDS.test(text)
}

/**
 * True when the shopper is asking to send their own gear back.
 *
 * @param text - Customer message.
 * @param persona - Shopper record.
 * @returns Whether to lead with the return fact.
 */
function isPersonalReturn(text: string, persona: InternalPersona): boolean {
  if (!RETURN_WORDS.test(text)) {
    return false
  }
  return mentionsPersona(text, persona) || /\bmy\b/i.test(text)
}

/**
 * True when the shopper is asking about their own charges.
 *
 * @param text - Customer message.
 * @param persona - Shopper record.
 * @returns Whether to lead with billing facts.
 */
function isPersonalBilling(text: string, persona: InternalPersona): boolean {
  if (!BILLING_WORDS.test(text)) {
    return false
  }
  return mentionsPersona(text, persona) || /\b(my|twice|i)\b/i.test(text)
}

/**
 * True when the message names this shopper's item or order.
 *
 * @param text - Customer message.
 * @param persona - Shopper record.
 * @returns Whether an alias is present.
 */
function mentionsPersona(text: string, persona: InternalPersona): boolean {
  const normalized = text.toLowerCase()
  return persona.aliases.some((alias) => normalized.includes(alias.toLowerCase()))
}

/**
 * Joins a personal fact with the steps from a help note.
 *
 * @param lead - Sentence from the shopper record, when there is one.
 * @param article - Help note to quote, when retrieval found one.
 * @returns The customer-facing draft.
 */
function compose(lead: string | null, article: Article | undefined): string {
  if (!article) {
    return lead ?? 'I can ask the desk to take this from here.'
  }
  const steps = article.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
  const parts = [lead, article.directAnswer, `Here's the short version:\n${steps}`].filter(
    (part): part is string => Boolean(part),
  )
  return parts.join('\n\n')
}

/**
 * Builds an answer decision.
 *
 * @param text - Draft reply.
 * @param confidence - Score from 0 to 1.
 * @param article - Cited help note, when the reply used one.
 * @param retrievalScore - Score stored for the desk. Defaults to confidence.
 * @returns A decision that stays with Cove.
 */
function answer(
  text: string,
  confidence: number,
  article?: Article,
  retrievalScore = confidence,
): ReplyDecision {
  if (!article) {
    return {
      text,
      handoff: false,
      handoffReason: null,
      citations: [],
      confidence,
      retrieval: null,
    }
  }
  return {
    text,
    handoff: false,
    handoffReason: null,
    citations: [{ id: article.id, title: article.title }],
    confidence,
    retrieval: {
      articleId: article.id,
      title: article.title,
      score: retrievalScore,
    },
  }
}

/**
 * Builds a handoff decision.
 *
 * @param text - What Cove tells the shopper.
 * @param reason - Short reason shown on the desk.
 * @returns A decision that queues the thread.
 */
function handoff(text: string, reason: string): ReplyDecision {
  return {
    text,
    handoff: true,
    handoffReason: reason,
    citations: [],
    confidence: 1,
    retrieval: null,
  }
}

/**
 * Finds a catalog article by id without throwing.
 *
 * @param catalog - Articles to search.
 * @param articleId - Expected id.
 * @returns The article, or `undefined` if the catalog was replaced in a test.
 */
function findArticle(catalog: readonly Article[], articleId: string): Article | undefined {
  return catalog.find((article) => article.id === articleId)
}
