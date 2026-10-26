import { healthSchema, type Conversation, type Health } from '@cove/shared'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Composer } from '../components/composer'
import { ContextPanel } from '../components/context-panel'
import { CoveMark } from '../components/marks'
import { MessageList } from '../components/message-list'
import { QueueList } from '../components/queue-list'
import { StatusPill } from '../components/status-pill'
import { useDesk } from '../hooks/use-desk'
import { getJson } from '../lib/api'

/** Agent console for the same threads the storefront opens. */
export function DeskPage() {
  const [agentName, setAgentName] = useState(() => sessionStorage.getItem('cove.agentName') ?? 'Maya Ellis')
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [health, setHealth] = useState<Health | null>(null)
  const desk = useDesk(agentName)
  const selected = desk.selectedId ? desk.conversations[desk.selectedId] : undefined

  useEffect(() => {
    document.title = 'Cove Desk'
  }, [])

  useEffect(() => {
    sessionStorage.setItem('cove.agentName', agentName)
  }, [agentName])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    getJson('/api/health', healthSchema)
      .then((status) => {
        if (!cancelled) {
          setHealth(status)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setDraft('')
  }, [desk.selectedId])

  const waiting = desk.items.filter((item) => item.status === 'queued').length
  const live = desk.items.filter((item) => item.status === 'active').length
  const mine = selected != null && selected.status === 'active' && selected.assignee === agentName.trim()
  const typingLabel = typingFor(selected, desk.typing, agentName)

  return (
    <div className="desk">
      <p className="demo-banner">
        Demo desk. There is no sign-in. A production desk would sit behind agent authentication.
      </p>
      <header className="desk-bar">
        <Link to="/" className="brand brand-small">
          <CoveMark />
          <span>Cove Desk</span>
        </Link>
        <p className="counts">
          <span>{waiting} waiting</span>
          <span>{live} live</span>
          <span>{health?.modelEnabled ? 'Model polish on' : 'Help notes'}</span>
        </p>
        <div className="desk-bar-end">
          <label className="name-field">
            <span className="sr-only">Your name</span>
            <input
              value={agentName}
              maxLength={40}
              autoComplete="name"
              aria-label="Your name on the desk"
              onChange={(event) => setAgentName(event.target.value)}
            />
          </label>
          <span className={desk.connected ? 'dot is-on' : 'dot'} title={desk.connected ? 'Connected' : 'Reconnecting'} />
        </div>
      </header>

      {desk.notice ? (
        <p className="notice notice-desk" role="status">
          {desk.notice}
          <button type="button" className="text-button" onClick={desk.dismissNotice}>
            Dismiss
          </button>
        </p>
      ) : null}

      <div className="desk-grid">
        <QueueList items={desk.items} selectedId={desk.selectedId} now={now} onSelect={desk.select} />

        <section className="transcript" aria-label="Conversation">
          {selected ? (
            <>
              <header className="transcript-head">
                <div>
                  <p className="eyebrow">{selected.persona.city}</p>
                  <h2>{selected.persona.name}</h2>
                  <p>
                    {selected.persona.order.id} · {selected.persona.order.item}
                  </p>
                </div>
                <div className="transcript-actions">
                  <StatusPill status={selected.status} />
                  {selected.status === 'queued' || selected.status === 'bot' ? (
                    <button
                      type="button"
                      className="button-primary"
                      disabled={agentName.trim().length === 0}
                      onClick={() => desk.claim(selected.id)}
                    >
                      {selected.status === 'bot' ? 'Take over' : 'Claim'}
                    </button>
                  ) : null}
                  {mine ? (
                    <button type="button" className="button-ghost" onClick={() => desk.resolve(selected.id)}>
                      Resolve
                    </button>
                  ) : null}
                  {selected.status === 'active' && !mine ? <span className="pill">With {selected.assignee}</span> : null}
                </div>
              </header>
              <div className="transcript-scroll">
                <MessageList messages={selected.messages} layout="transcript" typingLabel={typingLabel} />
              </div>
              <Composer
                value={draft}
                label="Reply to the shopper"
                placeholder={mine ? 'Reply to the shopper' : 'Claim this conversation to reply'}
                disabled={!mine}
                onChange={setDraft}
                onTyping={(isTyping) => desk.setTyping(selected.id, isTyping)}
                onSubmit={() => {
                  desk.reply(selected.id, draft)
                  setDraft('')
                }}
              />
            </>
          ) : (
            <div className="empty">
              <p className="eyebrow">Inbox</p>
              <h2>No one is here yet.</h2>
              <p>Open the storefront, ask Cove for a person, and the thread lands in this queue.</p>
              <Link to="/" className="button-primary">
                Open the storefront
              </Link>
            </div>
          )}
        </section>

        {selected ? (
          <ContextPanel
            conversation={selected}
            canWrite={mine}
            onInsert={(text) =>
              setDraft((current) => (current.trim().length === 0 ? text : `${current.trim()} ${text}`))
            }
            onNote={(text) => desk.note(selected.id, text)}
          />
        ) : (
          <aside className="context" />
        )}
      </div>
    </div>
  )
}

/**
 * Label for the typing line in the open transcript.
 *
 * @param conversation - Thread on screen.
 * @param typing - Latest typing pulse.
 * @param agentName - This desk's name, so we don't show our own typing.
 * @returns A label, or null when nobody else is typing.
 */
function typingFor(
  conversation: Conversation | undefined,
  typing: { conversationId: string; author: string; authorName: string; isTyping: boolean } | null,
  agentName: string,
): string | null {
  if (!conversation || !typing || !typing.isTyping || typing.conversationId !== conversation.id) {
    return null
  }
  if (typing.author === 'agent' && typing.authorName === agentName.trim()) {
    return null
  }
  if (typing.author === 'customer') {
    return `${conversation.persona.name} is typing`
  }
  if (typing.author === 'assistant') {
    return 'Cove is typing'
  }
  return `${typing.authorName} is typing`
}
