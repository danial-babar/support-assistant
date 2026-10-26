import type { Message } from '@cove/shared'
import { useEffect, useRef } from 'react'
import { formatTime } from '../lib/format'

interface MessageBubbleProps {
  readonly message: Message
  readonly layout: 'widget' | 'transcript'
  readonly onCitation?: (articleId: string) => void
}

/** Renders one transcript entry, including system lines and citations. */
export function MessageBubble({ message, layout, onCitation }: MessageBubbleProps) {
  if (message.role === 'system') {
    return <p className="system-line">{message.text}</p>
  }

  const align = layout === 'widget' && message.role === 'customer' ? 'is-end' : 'is-start'

  return (
    <article className={`bubble bubble-${message.role} ${align}`}>
      <header>
        <span>{message.authorName ?? 'Northline'}</span>
        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
      </header>
      <p>{message.text}</p>
      {message.citations.length > 0 ? (
        <ul className="citations">
          {message.citations.map((citation) => (
            <li key={citation.id}>
              {onCitation ? (
                <a
                  href={`#article-${citation.id}`}
                  onClick={() => onCitation(citation.id)}
                >
                  Source · {citation.title}
                </a>
              ) : (
                <span>Source · {citation.title}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

interface MessageListProps {
  readonly messages: readonly Message[]
  readonly layout: 'widget' | 'transcript'
  readonly typingLabel: string | null
  readonly onCitation?: (articleId: string) => void
}

/** Scrolls the thread to the latest line when a message or typing state changes. */
export function MessageList({ messages, layout, typingLabel, onCitation }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, typingLabel])

  return (
    <div className="thread" aria-live="polite">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          layout={layout}
          onCitation={onCitation}
        />
      ))}
      {typingLabel ? (
        <p className="typing">
          {typingLabel}
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </p>
      ) : null}
      <div ref={endRef} />
    </div>
  )
}
