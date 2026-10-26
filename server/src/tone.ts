import type { Tone } from '@cove/shared'

const FRUSTRATED_PHRASES = [
  'angry',
  'upset',
  'ridiculous',
  'worst',
  'annoyed',
  'useless',
  'charged twice',
  'unacceptable',
  'furious',
  'waiting forever',
] as const

const POSITIVE_PHRASES = ['thanks', 'thank you', 'great', 'perfect', 'awesome', 'love'] as const

/**
 * Updates the thread tone from the latest customer message.
 * Frustration sticks so a later "thanks" does not hide an unhappy queue item
 * until the person actually softens the conversation. A positive message only
 * wins when the thread was not already frustrated.
 *
 * @param text - Raw customer message.
 * @param previous - Tone already stored on the thread.
 * @returns The tone the desk should show.
 */
export function detectTone(text: string, previous: Tone): Tone {
  const normalized = text.toLowerCase()
  if (FRUSTRATED_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return 'frustrated'
  }
  if (previous === 'frustrated') {
    return 'frustrated'
  }
  if (POSITIVE_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return 'positive'
  }
  return 'calm'
}
