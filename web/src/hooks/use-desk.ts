import {
  conversationSchema,
  events,
  noticeSchema,
  queueSnapshotSchema,
  typingSchema,
  type Conversation,
  type QueueItem,
  type TypingPulse,
} from '@cove/shared'
import throttle from 'lodash/throttle'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createSocket } from '../lib/socket'

const TYPING_FALLBACK_MS = 12000

/** Live desk inbox. */
export interface DeskState {
  readonly items: readonly QueueItem[]
  readonly conversations: Readonly<Record<string, Conversation>>
  readonly selectedId: string | null
  readonly connected: boolean
  readonly typing: TypingPulse | null
  readonly notice: string | null
  readonly select: (conversationId: string) => void
  readonly claim: (conversationId: string) => void
  readonly reply: (conversationId: string, text: string) => void
  readonly note: (conversationId: string, text: string) => void
  readonly resolve: (conversationId: string) => void
  readonly setTyping: (conversationId: string, isTyping: boolean) => void
  readonly dismissNotice: () => void
}

/**
 * Connects the desk to the shared inbox.
 * The name is sent with each agent action so a second browser cannot reply
 * as the person who claimed the chat.
 *
 * @param agentName - Display name from the desk header.
 * @returns Queue, open threads, and agent actions.
 */
export function useDesk(agentName: string): DeskState {
  const [items, setItems] = useState<QueueItem[]>([])
  const [conversations, setConversations] = useState<Record<string, Conversation>>({})
  const [selectedId, setSelectedId] = useState<string | null>(() => sessionStorage.getItem('cove.selected'))
  const [connected, setConnected] = useState(false)
  const [typing, setTyping] = useState<TypingPulse | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null)
  const typingRef = useRef<((conversationId: string, isTyping: boolean) => void) | null>(null)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId

  useEffect(() => {
    const socket = createSocket()
    socketRef.current = socket
    let fallback = 0

    const emitTyping = throttle((conversationId: string, isTyping: boolean) => {
      socket.emit(events.typing, { conversationId, isTyping })
    }, 250, { leading: true, trailing: true })
    typingRef.current = emitTyping

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on(events.queueSnapshot, (payload: unknown) => {
      const parsed = queueSnapshotSchema.safeParse(payload)
      if (parsed.success) {
        setItems(parsed.data)
      }
    })

    socket.on(events.conversationSnapshot, (payload: unknown) => {
      const parsed = conversationSchema.safeParse(payload)
      if (!parsed.success) {
        setNotice('The desk received a thread it could not read.')
        return
      }
      setConversations((current) => ({ ...current, [parsed.data.id]: parsed.data }))
      if (parsed.data.id === selectedRef.current) {
        window.clearTimeout(fallback)
        setTyping(null)
      }
    })

    socket.on(events.typing, (payload: unknown) => {
      const parsed = typingSchema.safeParse(payload)
      if (!parsed.success) {
        return
      }
      if (!parsed.data.isTyping) {
        setTyping((current) => (current?.conversationId === parsed.data.conversationId ? null : current))
        return
      }
      setTyping(parsed.data)
      window.clearTimeout(fallback)
      fallback = window.setTimeout(() => setTyping(null), TYPING_FALLBACK_MS)
    })

    socket.on(events.notice, (payload: unknown) => {
      const parsed = noticeSchema.safeParse(payload)
      if (parsed.success) {
        setNotice(parsed.data.message)
      }
    })

    return () => {
      window.clearTimeout(fallback)
      emitTyping.cancel()
      typingRef.current = null
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    const trimmed = agentName.trim()
    if (!connected || trimmed.length === 0) {
      return
    }
    socketRef.current?.emit(events.deskJoin, { agentName: trimmed })
  }, [agentName, connected])

  useEffect(() => {
    if (!selectedId) {
      return
    }
    sessionStorage.setItem('cove.selected', selectedId)
    if (!connected) {
      return
    }
    socketRef.current?.emit(events.conversationWatch, { conversationId: selectedId })
  }, [selectedId, connected])

  useEffect(() => {
    if (items.length === 0) {
      return
    }
    if (selectedId && items.some((item) => item.id === selectedId)) {
      return
    }
    const next = items.find((item) => item.status === 'queued') ?? items[0]
    setSelectedId(next?.id ?? null)
  }, [items, selectedId])

  const select = useCallback((conversationId: string) => {
    setSelectedId(conversationId)
    setNotice(null)
  }, [])

  const claim = useCallback(
    (conversationId: string) => {
      setNotice(null)
      socketRef.current?.emit(events.conversationClaim, {
        conversationId,
        agentName: agentName.trim(),
      })
    },
    [agentName],
  )

  const reply = useCallback(
    (conversationId: string, text: string) => {
      const trimmed = text.trim()
      if (trimmed.length === 0) {
        return
      }
      setNotice(null)
      typingRef.current?.(conversationId, false)
      socketRef.current?.emit(events.conversationReply, {
        conversationId,
        agentName: agentName.trim(),
        text: trimmed,
      })
    },
    [agentName],
  )

  const note = useCallback(
    (conversationId: string, text: string) => {
      const trimmed = text.trim()
      if (trimmed.length === 0) {
        return
      }
      setNotice(null)
      socketRef.current?.emit(events.conversationNote, {
        conversationId,
        agentName: agentName.trim(),
        text: trimmed,
      })
    },
    [agentName],
  )

  const resolve = useCallback(
    (conversationId: string) => {
      setNotice(null)
      socketRef.current?.emit(events.conversationResolve, {
        conversationId,
        agentName: agentName.trim(),
      })
    },
    [agentName],
  )

  const setComposerTyping = useCallback((conversationId: string, isTyping: boolean) => {
    typingRef.current?.(conversationId, isTyping)
  }, [])

  const dismissNotice = useCallback(() => setNotice(null), [])

  return {
    items,
    conversations,
    selectedId,
    connected,
    typing,
    notice,
    select,
    claim,
    reply,
    note,
    resolve,
    setTyping: setComposerTyping,
    dismissNotice,
  }
}
