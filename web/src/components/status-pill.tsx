import type { ConversationStatus } from '@cove/shared'
import { statusLabel } from '../lib/format'

interface StatusPillProps {
  readonly status: ConversationStatus
}

/** Compact status chip for queue rows and the transcript header. */
export function StatusPill({ status }: StatusPillProps) {
  return <span className={`pill pill-${status}`}>{statusLabel(status)}</span>
}
