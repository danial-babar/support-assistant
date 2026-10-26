import type { QueueItem } from '@cove/shared'
import groupBy from 'lodash/groupBy'
import { formatWait } from '../lib/format'
import { StatusPill } from './status-pill'

const SECTIONS = [
  { status: 'queued', label: 'Waiting' },
  { status: 'active', label: 'With a person' },
  { status: 'bot', label: 'With Cove' },
  { status: 'resolved', label: 'Resolved' },
] as const

interface QueueListProps {
  readonly items: readonly QueueItem[]
  readonly selectedId: string | null
  readonly now: number
  readonly onSelect: (conversationId: string) => void
}

/** Inbox grouped by who owns the thread. */
export function QueueList({ items, selectedId, now, onSelect }: QueueListProps) {
  const grouped = groupBy(items, (item) => item.status)

  return (
    <div className="queue">
      {SECTIONS.map((section) => {
        const rows = grouped[section.status] ?? []
        if (rows.length === 0) {
          return null
        }
        return (
          <section key={section.status} className="queue-section" aria-label={section.label}>
            <h2>
              {section.label}
              <span>{rows.length}</span>
            </h2>
            {rows.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === selectedId ? 'queue-item is-selected' : 'queue-item'}
                onClick={() => onSelect(item.id)}
              >
                <span className="queue-item-top">
                  <strong>{item.customerName}</strong>
                  <time dateTime={item.updatedAt}>{formatWait(item.updatedAt, now)}</time>
                </span>
                <span className="queue-item-order">
                  {item.orderId} · {item.item}
                </span>
                <span className="queue-item-preview">{item.preview}</span>
                <span className="queue-item-pills">
                  <StatusPill status={item.status} />
                  {item.tone === 'frustrated' ? <span className="pill pill-hot">Needs care</span> : null}
                  {item.assignee ? <span className="pill">{item.assignee}</span> : null}
                </span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}
