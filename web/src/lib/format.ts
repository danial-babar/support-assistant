import type { ConversationStatus } from '@cove/shared'

/**
 * Formats a transcript timestamp for the shopper's locale.
 *
 * @param iso - ISO timestamp.
 * @returns A short time, such as `3:42 PM`.
 */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * Formats how long a queue row has been quiet.
 *
 * @param iso - ISO timestamp of the last update.
 * @param now - Current time in milliseconds.
 * @returns A compact wait label.
 */
export function formatWait(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

/**
 * Renders a 0–1 confidence score as a percent.
 *
 * @param score - Confidence from the responder.
 * @returns A percent label.
 */
export function confidenceLabel(score: number): string {
  return `${Math.round(score * 100)}%`
}

/**
 * Maps a thread status to the label used in the desk.
 *
 * @param status - Thread status.
 * @returns A short status label.
 */
export function statusLabel(status: ConversationStatus): string {
  switch (status) {
    case 'bot':
      return 'With Cove'
    case 'queued':
      return 'Waiting'
    case 'active':
      return 'Live'
    case 'resolved':
      return 'Resolved'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}
