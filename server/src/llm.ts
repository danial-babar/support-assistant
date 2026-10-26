import { z } from 'zod'
import { config, isModelEnabled } from './config'

const modelReplySchema = z.object({
  reply: z.string().trim().min(1).max(2000),
})

/**
 * Rewrites a grounded draft when a model key is configured.
 * The draft is already the answer. The model is only a copy editor: it must
 * not add facts, and any failure returns the draft unchanged.
 *
 * @param draft - Reply produced by policy code.
 * @returns The polished reply, or the original draft.
 */
export async function polishReply(draft: string): Promise<string> {
  if (!isModelEnabled()) {
    return draft
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openAiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are Cove, writing for Northline support. Rewrite the draft so it is warm, brief, and plain. Do not add facts, offers, or steps that are not in the draft. Return JSON: {"reply":"..."}.',
          },
          {
            role: 'user',
            content: draft,
          },
        ],
      }),
    })

    if (!response.ok) {
      return draft
    }

    const body: unknown = await response.json()
    const content = readContent(body)
    if (!content) {
      return draft
    }
    const parsed = modelReplySchema.safeParse(JSON.parse(content))
    return parsed.success ? parsed.data.reply : draft
  } catch {
    return draft
  }
}

/**
 * Reads the first chat-completion string from an unknown JSON body.
 *
 * @param body - Parsed response JSON.
 * @returns The message content, or `null` when the shape is unexpected.
 */
function readContent(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('choices' in body)) {
    return null
  }
  const choices = body.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return null
  }
  const first: unknown = choices[0]
  if (!first || typeof first !== 'object' || !('message' in first)) {
    return null
  }
  const message = first.message
  if (!message || typeof message !== 'object' || !('content' in message)) {
    return null
  }
  return typeof message.content === 'string' ? message.content : null
}
