/** Socket.io event names shared by the server and both clients. */
export const events = {
  conversationStart: 'conversation:start',
  conversationResume: 'conversation:resume',
  conversationWatch: 'conversation:watch',
  conversationSnapshot: 'conversation:snapshot',
  queueSnapshot: 'queue:snapshot',
  messageSend: 'message:send',
  handoffRequest: 'handoff:request',
  typing: 'typing',
  csatSubmit: 'csat:submit',
  deskJoin: 'desk:join',
  conversationClaim: 'conversation:claim',
  conversationReply: 'conversation:reply',
  conversationNote: 'conversation:note',
  conversationResolve: 'conversation:resolve',
  notice: 'notice',
} as const

/**
 * Replies an agent can drop into the composer and edit before sending.
 * Kept here so the desk does not invent policy copy ad hoc.
 */
export const CANNED_REPLIES = [
  "I'm looking at this with you now.",
  'I can see the order on our side. Give me a moment to check the carrier.',
  "I've emailed a prepaid return label. It stays valid for 14 days.",
  'The duplicate Trail Club charge is queued to reverse within two business days.',
  "I'm sorry this was messy. I'm taking it from here.",
] as const
