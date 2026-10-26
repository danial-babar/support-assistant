import uniq from 'lodash/uniq'
import orderBy from 'lodash/orderBy'
import type { Article } from './knowledge-base'

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'you',
  'your',
  'can',
  'how',
  'what',
  'when',
  'where',
  'does',
  'did',
  'this',
  'that',
  'with',
  'from',
  'have',
  'has',
  'was',
  'are',
  'not',
  'but',
  'about',
  'into',
  'just',
  'please',
  'tell',
  'why',
  'work',
  'cover',
  'should',
  'would',
  'could',
  'want',
  'need',
])

/** An article plus the 0–1 score used to accept or refuse an answer. */
export interface RankedArticle {
  readonly article: Article
  readonly score: number
}

/**
 * Light stem so "returns" and "return" land on the same token.
 *
 * @param token - Lowercase word.
 * @returns The token, with a trailing s removed when it is long enough.
 */
export function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith('s')) {
    return token.slice(0, -1)
  }
  return token
}

/**
 * Pulls meaningful words out of a customer message or an article.
 *
 * @param text - Raw text.
 * @returns Unique stemmed tokens, in first-seen order.
 */
export function tokenize(text: string): string[] {
  const rough = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => stemToken(token))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  return uniq(rough)
}

/**
 * Scores one article by how much of the question it actually covers.
 * Keyword and title hits raise the score, but uncovered question words
 * keep a vague overlap from looking confident.
 *
 * @param queryTokens - Stemmed tokens from the customer.
 * @param article - Help note to score.
 * @returns A score from 0 to 1.
 */
export function scoreArticle(queryTokens: readonly string[], article: Article): number {
  if (queryTokens.length === 0) {
    return 0
  }

  const documentTokens = new Set(
    tokenize(
      [
        article.title,
        article.summary,
        article.directAnswer,
        article.steps.join(' '),
        article.keywords.join(' '),
      ].join(' '),
    ),
  )
  const titleTokens = new Set(tokenize(article.title))
  const keywordTokens = new Set(article.keywords.flatMap((keyword) => tokenize(keyword)))

  let matched = 0
  let weight = 0
  for (const token of queryTokens) {
    if (!documentTokens.has(token)) {
      continue
    }
    matched += 1
    weight += 1
    if (keywordTokens.has(token)) {
      weight += 0.65
    }
    if (titleTokens.has(token)) {
      weight += 0.45
    }
  }

  const coverage = matched / queryTokens.length
  const density = Math.min(weight / queryTokens.length, 2) / 2
  return Math.min(1, coverage * 0.72 + density * 0.28)
}

/**
 * Ranks the catalog for a message. Empty and stop-word-only messages rank nothing.
 *
 * @param query - Customer message.
 * @param catalog - Help notes to search.
 * @returns Articles from strongest match to weakest.
 */
export function rankArticles(query: string, catalog: readonly Article[]): RankedArticle[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) {
    return []
  }
  const ranked = catalog.map((article) => ({
    article,
    score: scoreArticle(queryTokens, article),
  }))
  return orderBy(ranked, [(entry) => entry.score], ['desc'])
}
