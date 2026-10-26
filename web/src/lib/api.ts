import type { ZodType } from 'zod'

/**
 * Fetches JSON and parses it with the shared contract.
 *
 * @param path - API path, beginning with `/api`.
 * @param schema - Schema the body must match.
 * @returns The parsed body.
 */
export async function getJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return schema.parse(await response.json())
}
