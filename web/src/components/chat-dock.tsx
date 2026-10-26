import { useEffect, useRef, useState } from 'react'
import { Composer } from './composer'
import { CoveMark } from './marks'
import { MessageList } from './message-list'
import { useCustomerChat } from '../hooks/use-customer-chat'

interface ChatDockProps {
  readonly personaId: string
  readonly launchQuestion: string | null
  readonly onLaunchConsumed: () => void
  readonly onCitation: (articleId: string) => void
}

const CSAT_LABELS = ['Poor', 'Okay', 'Good', 'Great', 'Excellent'] as const
const recentLaunches = new Map<string, number>()

/**
 * Embedded Cove chat. It owns the socket for the selected shopper.
 */
export function ChatDock({
  personaId,
  launchQuestion,
  onLaunchConsumed,
  onCitation,
}: ChatDockProps) {
  const chat = useCustomerChat(personaId)
  const [draft, setDraft] = useState('')
  const { conversation, send } = chat
  const onLaunchConsumedRef = useRef(onLaunchConsumed)
  onLaunchConsumedRef.current = onLaunchConsumed

  useEffect(() => {
    if (!launchQuestion || !conversation) {
      return
    }
    const key = `${conversation.id}:${launchQuestion}`
    const now = Date.now()
    const previous = recentLaunches.get(key) ?? 0
    if (now - previous < 1000) {
      onLaunchConsumedRef.current()
      return
    }
    recentLaunches.set(key, now)
    send(launchQuestion)
    onLaunchConsumedRef.current()
  }, [conversation, launchQuestion, send])

  const statusLine = describeStatus(chat)
  const typingLabel = chat.assistantTyping
    ? 'Cove is typing'
    : chat.agentTypingName
      ? `${chat.agentTypingName} is typing`
      : null
  const canCompose = conversation != null && conversation.status !== 'resolved'

  return (
    <section className="dock" id="chat" aria-label="Cove chat">
      <header className="dock-header">
        <CoveMark />
        <div>
          <strong>Cove</strong>
          <p>{statusLine}</p>
        </div>
        <span
          className={chat.connected ? 'dot is-on' : 'dot'}
          title={chat.connected ? 'Connected' : 'Reconnecting'}
        />
      </header>

      <div className="dock-thread">
        {conversation ? (
          <MessageList
            messages={conversation.messages}
            layout="widget"
            typingLabel={typingLabel}
            onCitation={onCitation}
          />
        ) : (
          <p className="typing">Opening Cove…</p>
        )}
      </div>

      {chat.notice ? (
        <p className="notice" role="status">
          {chat.notice}
          <button type="button" className="text-button" onClick={chat.dismissNotice}>
            Dismiss
          </button>
        </p>
      ) : null}

      {conversation?.status === 'bot' ? (
        <div className="chips">
          {conversation.persona.suggestedPrompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => send(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      {conversation?.status === 'resolved' ? (
        <div className="csat">
          {conversation.csat == null ? (
            <>
              <p>How did we do?</p>
              <div className="chips">
                {CSAT_LABELS.map((label, index) => (
                  <button key={label} type="button" onClick={() => chat.submitCsat(index + 1)}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>You rated this {conversation.csat} / 5.</p>
          )}
          <button type="button" className="text-button" onClick={chat.restart}>
            Start a new chat
          </button>
        </div>
      ) : null}

      {conversation?.status === 'bot' ? (
        <button type="button" className="handoff-link" onClick={chat.requestHandoff}>
          Talk to a person
        </button>
      ) : null}

      <Composer
        value={draft}
        label="Message Cove"
        placeholder={canCompose ? 'Ask about the order, or ask for a person' : 'This chat is resolved'}
        disabled={!canCompose}
        onChange={setDraft}
        onTyping={chat.setTyping}
        onSubmit={() => {
          send(draft)
          setDraft('')
        }}
      />
    </section>
  )
}

/**
 * One-line status under the Cove wordmark.
 *
 * @param chat - Current dock state.
 * @returns The status sentence.
 */
function describeStatus(chat: ReturnType<typeof useCustomerChat>): string {
  if (!chat.connected) {
    return 'Reconnecting'
  }
  const conversation = chat.conversation
  if (!conversation) {
    return 'Opening the chat'
  }
  if (conversation.status === 'queued') {
    return 'Waiting for the Northline desk'
  }
  if (conversation.status === 'active') {
    return `${conversation.assignee ?? 'A teammate'} is here`
  }
  if (conversation.status === 'resolved') {
    return 'Resolved'
  }
  return `${conversation.persona.name.split(' ')[0]} · ${conversation.persona.order.id}`
}
