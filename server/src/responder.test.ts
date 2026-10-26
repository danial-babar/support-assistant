import { describe, expect, it } from 'vitest'
import { articles } from './knowledge-base'
import { getPersona } from './personas'
import { ANSWER_THRESHOLD, decideReply } from './responder'
import { rankArticles } from './retrieval'

const avery = requiredPersona('avery')
const jordan = requiredPersona('jordan')
const sam = requiredPersona('sam')

describe('decideReply', () => {
  it('answers Avery with the live shipment instead of a generic article', () => {
    const decision = decideReply('Where is order NL-10482?', avery)
    expect(decision.handoff).toBe(false)
    expect(decision.text).toContain('NL-10482')
    expect(decision.text).toContain('out for delivery')
  })

  it('queues the desk when the shopper asks for a person', () => {
    const decision = decideReply('Talk to a person', avery)
    expect(decision.handoff).toBe(true)
    expect(decision.handoffReason).toBe('Customer asked for a person')
  })

  it('answers a general return question from the help note', () => {
    const decision = decideReply('How do returns work?', avery)
    expect(decision.handoff).toBe(false)
    expect(decision.citations[0]?.id).toBe('returns-30-days')
    expect(decision.text).not.toContain('Ridgeline')
    expect(decision.confidence).toBeGreaterThanOrEqual(ANSWER_THRESHOLD)
  })

  it('uses Jordan’s delivery date on a return of those boots', () => {
    const decision = decideReply('Can I return the Ridgeline Boots?', jordan)
    expect(decision.handoff).toBe(false)
    expect(decision.text).toContain('12 days')
    expect(decision.text).toContain('30-day')
  })

  it('explains Sam’s duplicate Trail Club charge', () => {
    const decision = decideReply('Why was I charged twice?', sam)
    expect(decision.handoff).toBe(false)
    expect(decision.text).toContain('duplicate')
    expect(decision.text).toContain('$79')
  })

  it('cites the warranty note for a warranty question', () => {
    const decision = decideReply('What does the warranty cover?', jordan)
    expect(decision.handoff).toBe(false)
    expect(decision.citations[0]?.id).toBe('warranty')
  })

  it('refuses to guess when the message is outside the notes', () => {
    const decision = decideReply('asdf qqqq zzz', avery)
    expect(decision.handoff).toBe(true)
    expect(decision.handoffReason).toBe('Question was outside the help notes')
  })
})

describe('rankArticles', () => {
  it('ranks the return note first for a return question', () => {
    const [best] = rankArticles('How do returns work?', articles)
    expect(best?.article.id).toBe('returns-30-days')
    expect(best?.score).toBeGreaterThanOrEqual(ANSWER_THRESHOLD)
  })
})

/**
 * Loads a demo shopper or fails the suite.
 *
 * @param personaId - Catalog id.
 * @returns The internal persona.
 */
function requiredPersona(personaId: string) {
  const persona = getPersona(personaId)
  if (!persona) {
    throw new Error(`Missing persona ${personaId}`)
  }
  return persona
}
