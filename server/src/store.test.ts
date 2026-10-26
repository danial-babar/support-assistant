import { describe, expect, it } from 'vitest'
import { ConversationStore } from './store'

describe('ConversationStore', () => {
  it('greets the shopper with their order', () => {
    const store = new ConversationStore()
    const conversation = store.create('avery')
    expect(conversation.status).toBe('bot')
    expect(conversation.messages[0]?.text).toContain('NL-10482')
    expect(conversation.notes).toEqual([])
  })

  it('keeps a second agent from taking an assigned chat', () => {
    const store = new ConversationStore()
    const conversation = store.create('jordan')
    store.markQueued(conversation.id, 'Customer asked for a person')
    store.claim(conversation.id, 'Maya Ellis')
    expect(() => store.claim(conversation.id, 'Luis Ortega')).toThrow(/already with Maya Ellis/)
  })

  it('sorts a frustrated waiting chat ahead of a calm one', () => {
    const store = new ConversationStore()
    const calm = store.create('avery')
    const upset = store.create('sam')
    store.markQueued(calm.id, 'Customer asked for a person')
    store.addCustomerMessage(upset.id, 'This double charge is unacceptable')
    store.markQueued(upset.id, 'Question was outside the help notes')

    const [first] = store.listQueue().filter((item) => item.status === 'queued')
    expect(first?.id).toBe(upset.id)
    expect(first?.tone).toBe('frustrated')
  })

  it('accepts a rating only after the chat is resolved', () => {
    const store = new ConversationStore()
    const conversation = store.create('sam')
    store.markQueued(conversation.id, 'Customer asked for a person')
    store.claim(conversation.id, 'Maya Ellis')
    expect(() => store.setCsat(conversation.id, 5)).toThrow(/Resolve/)
    store.resolve(conversation.id, 'Maya Ellis')
    const rated = store.setCsat(conversation.id, 5)
    expect(rated.csat).toBe(5)
    expect(store.setCsat(conversation.id, 1).csat).toBe(5)
  })

  it('refuses a resume for a different shopper', () => {
    const store = new ConversationStore()
    const conversation = store.create('avery')
    expect(store.resume(conversation.id, 'jordan')).toBeUndefined()
    expect(store.resume(conversation.id, 'avery')?.id).toBe(conversation.id)
  })
})
