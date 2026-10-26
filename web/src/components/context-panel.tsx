import { CANNED_REPLIES, type Conversation } from '@cove/shared'
import { useState } from 'react'
import { confidenceLabel, formatTime } from '../lib/format'

interface ContextPanelProps {
  readonly conversation: Conversation
  readonly canWrite: boolean
  readonly onInsert: (text: string) => void
  readonly onNote: (text: string) => void
}

/** Shopper, order, Cove's last retrieval, and internal notes. */
export function ContextPanel({ conversation, canWrite, onInsert, onNote }: ContextPanelProps) {
  const [note, setNote] = useState('')
  const { persona, retrieval, confidence, handoffReason, tone } = conversation

  return (
    <aside className="context">
      <section className="context-block">
        <p className="eyebrow">Shopper</p>
        <h2>{persona.name}</h2>
        <p>{persona.email}</p>
        <p>
          {persona.city} · member since {persona.memberSince}
        </p>
        <p className="tone-line">Tone · {tone}</p>
      </section>

      <section className="context-block">
        <p className="eyebrow">Order</p>
        <h3>{persona.order.item}</h3>
        <p>{persona.order.detail}</p>
        <p>
          {persona.order.id} · {persona.order.total}
        </p>
        <p className="order-status">{persona.order.status}</p>
        <p>{persona.order.statusNote}</p>
      </section>

      {handoffReason ? (
        <section className="context-block callout">
          <p className="eyebrow">Handoff</p>
          <p>{handoffReason}</p>
        </section>
      ) : null}

      {retrieval ? (
        <section className="context-block">
          <p className="eyebrow">Cove used</p>
          <p>{retrieval.title}</p>
          <p>{confidenceLabel(retrieval.score)} match</p>
        </section>
      ) : confidence != null ? (
        <section className="context-block">
          <p className="eyebrow">Cove</p>
          <p>{confidenceLabel(confidence)} confident</p>
        </section>
      ) : null}

      <section className="context-block">
        <p className="eyebrow">Canned replies</p>
        <div className="canned">
          {CANNED_REPLIES.map((reply) => (
            <button key={reply} type="button" onClick={() => onInsert(reply)}>
              {reply}
            </button>
          ))}
        </div>
      </section>

      <section className="context-block">
        <p className="eyebrow">Internal notes</p>
        {conversation.notes.length === 0 ? (
          <p className="muted">{canWrite ? 'Only the desk can see these.' : 'Claim the chat to add a note.'}</p>
        ) : null}
        <ul className="note-list">
          {conversation.notes.map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.authorName} · {formatTime(entry.createdAt)}
              </span>
              <p>{entry.text}</p>
            </li>
          ))}
        </ul>
        <form
          className="note-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (note.trim().length === 0) {
              return
            }
            onNote(note)
            setNote('')
          }}
        >
          <label className="sr-only" htmlFor="internal-note">
            Internal note
          </label>
          <textarea
            id="internal-note"
            rows={3}
            value={note}
            disabled={!canWrite}
            placeholder={canWrite ? 'Add a note the shopper will not see' : 'Claim the chat before writing a note'}
            onChange={(event) => setNote(event.target.value)}
          />
          <button type="submit" className="button-ghost" disabled={!canWrite || note.trim().length === 0}>
            Save note
          </button>
        </form>
      </section>
    </aside>
  )
}
