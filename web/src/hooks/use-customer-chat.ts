import {
  customerConversationSchema,
  events,
  noticeSchema,
  typingSchema,
  type CustomerConversation,
} from '@cove/shared'
import throttle from 'lodash/throttle'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createSocket } from '../lib/socket'

const TYPING_FALLBACK_MS = 12000

/** Shopper chat connection for one demo persona. */
export interface CustomerChat {
  readonly conversation: CustomerConversation | null
  readonly connected: boolean
  readonly assistantTyping: boolean
  readonly agentTypingName: string | null
  readonly notice: string | null
  readonly send: (text: string) => void
  readonly requestHandoff: () => void
  readonly submitCsat: (score: number) => void
  readonly setTyping: (isTyping: boolean) => void
  readonly restart: () => void
  readonly dismissNotice: () => void
}

/**
 * Connects the shopper to one thread and resumes it after a refresh
 * while the server process is still up.
 *
 * @param personaId - Selected demo shopper, or null while the catalog loads.
 * @returns Chat state and actions for the dock.
 */
export function useCustomerChat(personaId: string | null): CustomerChat {
  const [conversation, setConversation] = useState<CustomerConversation | null>(null)
  const [connected, setConnected] = useState(false)
  const [assistantTyping, setAssistantTyping] = useState(false)
  const [agentTypingName, setAgentTypingName] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [epoch, setEpoch] = useState(0)
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const typingRef = useRef<((isTyping: boolean) => void) | null>(null)

  useEffect(() => {
    if (!personaId) {
      return
    }

    const socket = createSocket()
    socketRef.current = socket
    let fallback = 0

    const clearTyping = () => {
      window.clearTimeout(fallback)
      setAssistantTyping(false)
      setAgentTypingName(null)
    }

    const emitTyping = throttle((isTyping: boolean) => {
      const conversationId = conversationIdRef.current
      if (!conversationId) {
        return
      }
      socket.emit(events.typing, { conversationId, isTyping })
    }, 250, { leading: true, trailing: true })
    typingRef.current = emitTyping

    const openThread = () => {
      const stored = sessionStorage.getItem(storageKey(personaId))
      if (stored) {
        socket.emit(events.conversationResume, { conversationId: stored, personaId })
        return
      }
      socket.emit(events.conversationStart, { personaId })
    }

    socket.on('connect', () => {
      setConnected(true)
      openThread()
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on(events.conversationSnapshot, (payload: unknown) => {
      const parsed = customerConversationSchema.safeParse(payload)
      if (!parsed.success) {
        setNotice('The chat sent a payload this page could not read.')
        return
      }
      conversationIdRef.current = parsed.data.id
      sessionStorage.setItem(storageKey(personaId), parsed.data.id)
      setConversation(parsed.data)
      const last = parsed.data.messages.at(-1)
      if (last && last.role !== 'customer') {
        clearTyping()
      }
    })

    socket.on(events.typing, (payload: unknown) => {
      const parsed = typingSchema.safeParse(payload)
      if (!parsed.success || parsed.data.conversationId !== conversationIdRef.current) {
        return
      }
      if (!parsed.data.isTyping) {
        clearTyping()
        return
      }
      if (parsed.data.author === 'agent') {
        setAgentTypingName(parsed.data.authorName)
        setAssistantTyping(false)
      } else if (parsed.data.author === 'assistant') {
        setAssistantTyping(true)
        setAgentTypingName(null)
      }
      window.clearTimeout(fallback)
      fallback = window.setTimeout(clearTyping, TYPING_FALLBACK_MS)
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
      conversationIdRef.current = null
      setConversation(null)
      setConnected(false)
    }
  }, [personaId, epoch])

  const send = useCallback((text: string) => {
    const conversationId = conversationIdRef.current
    const trimmed = text.trim()
    if (!conversationId || trimmed.length === 0) {
      return
    }
    setNotice(null)
    typingRef.current?.(false)
    socketRef.current?.emit(events.messageSend, { conversationId, text: trimmed })
  }, [])

  const requestHandoff = useCallback(() => {
    const conversationId = conversationIdRef.current
    if (!conversationId) {
      return
    }
    socketRef.current?.emit(events.handoffRequest, { conversationId })
  }, [])

  const submitCsat = useCallback((score: number) => {
    const conversationId = conversationIdRef.current
    if (!conversationId) {
      return
    }
    socketRef.current?.emit(events.csatSubmit, { conversationId, score })
  }, [])

  const setTyping = useCallback((isTyping: boolean) => {
    typingRef.current?.(isTyping)
  }, [])

  const restart = useCallback(() => {
    if (!personaId) {
      return
    }
    sessionStorage.removeItem(storageKey(personaId))
    conversationIdRef.current = null
    setConversation(null)
    setEpoch((value) => value + 1)
  }, [personaId])

  const dismissNotice = useCallback(() => setNotice(null), [])

  return {
    conversation,
    connected,
    assistantTyping,
    agentTypingName,
    notice,
    send,
    requestHandoff,
    submitCsat,
    setTyping,
    restart,
    dismissNotice,
  }
}

/**
 * Session key for the shopper's current thread.
 *
 * @param personaId - Demo shopper id.
 * @returns The sessionStorage key.
 */
function storageKey(personaId: string): string {
  return `cove.customer.${personaId}`
}
