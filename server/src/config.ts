import 'dotenv/config'
import { z } from 'zod'

/**
 * Runtime configuration.
 * Missing optional values fall back to defaults so the demo runs with no setup.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  NODE_ENV: z.string().default('development'),
})

const env = envSchema.parse(process.env)

/** Resolved settings for the HTTP server and the optional model call. */
export const config = {
  port: env.PORT,
  clientOrigin: env.CLIENT_ORIGIN,
  openAiApiKey: env.OPENAI_API_KEY.trim(),
  openAiModel: env.OPENAI_MODEL,
  isTest: env.NODE_ENV === 'test',
  /** Short pause so the typing indicator is visible before a grounded reply. */
  replyDelayMs: env.NODE_ENV === 'test' ? 20 : 700,
} as const

/**
 * True when a model key is present and this process is not a test run.
 *
 * @returns Whether replies should be rewritten by the model.
 */
export function isModelEnabled(): boolean {
  return config.openAiApiKey.length > 0 && !config.isTest
}
