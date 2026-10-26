import {
  ARTICLE_CATEGORIES,
  articleListSchema,
  healthSchema,
  personaListSchema,
  type Health,
  type Persona,
  type PublicArticle,
} from '@cove/shared'
import groupBy from 'lodash/groupBy'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChatDock } from '../components/chat-dock'
import { MountainMark } from '../components/marks'
import { getJson } from '../lib/api'
import { useDebouncedValue } from '../lib/use-debounced-value'

const TOPIC_COPY: Record<(typeof ARTICLE_CATEGORIES)[number], string> = {
  Orders: 'Tracking, address changes, and cancellations.',
  Returns: 'The 30-day window, labels, and exchanges.',
  Billing: 'Trail Club, duplicates, and promo codes.',
  Product: 'Fit notes and the lifetime warranty.',
  Account: 'Desk hours and what a person can do.',
}

/** Northline help center with Cove docked beside the articles. */
export function StorefrontPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [articles, setArticles] = useState<PublicArticle[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [launchQuestion, setLaunchQuestion] = useState<string | null>(null)
  const [litId, setLitId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const debouncedQuery = useDebouncedValue(query, 180)

  useEffect(() => {
    document.title = 'Northline Help'
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getJson('/api/personas', personaListSchema),
      getJson('/api/knowledge', articleListSchema),
      getJson('/api/health', healthSchema),
    ])
      .then(([people, notes, status]) => {
        if (cancelled) {
          return
        }
        setPersonas(people)
        setArticles(notes)
        setHealth(status)
        const stored = sessionStorage.getItem('cove.persona')
        const initial = people.some((persona) => persona.id === stored) ? stored : people[0]?.id
        setPersonaId(initial ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('The help desk API is not running. From the project folder, run npm run dev, then refresh.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!litId) {
      return
    }
    const timer = window.setTimeout(() => setLitId(null), 2200)
    return () => window.clearTimeout(timer)
  }, [litId])

  const persona = personas.find((item) => item.id === personaId) ?? null
  const needle = debouncedQuery.trim().toLowerCase()
  const visibleArticles = needle
    ? articles.filter((article) =>
        `${article.title} ${article.summary} ${article.category}`.toLowerCase().includes(needle),
      )
    : articles
  const grouped = groupBy(visibleArticles, (article) => article.category)

  const choosePersona = (id: string) => {
    sessionStorage.setItem('cove.persona', id)
    setPersonaId(id)
  }

  const onCitation = useCallback((articleId: string) => {
    setLitId(articleId)
    document.getElementById(`article-${articleId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [])

  const consumeLaunch = useCallback(() => setLaunchQuestion(null), [])

  return (
    <div className="shop">
      <a className="skip" href="#chat">
        Skip to chat
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <MountainMark />
          <span>Northline</span>
        </Link>
        <nav className="topnav" aria-label="Help center">
          <a href="#topics">Topics</a>
          <a href="#articles">Articles</a>
        </nav>
        <div className="topbar-actions">
          <span className="model-pill">
            {health == null ? 'Connecting' : health.modelEnabled ? 'Model polish on' : 'Help notes'}
          </span>
          <Link to="/desk" className="desk-link">
            Open desk
          </Link>
        </div>
      </header>

      {loadError ? <p className="load-error">{loadError}</p> : null}

      <div className="shop-grid">
        <main className="help">
          <p className="eyebrow">Help center</p>
          <div className="lede">
            <h1>Help that knows the order, and a person when it doesn't.</h1>
            <p>
              Cove reads Northline's help notes and the order on this page. If a question needs
              judgment, the desk picks up the same thread.
            </p>
          </div>

          <div className="persona-row">
            <p className="eyebrow">Shop as</p>
            <div className="persona-switch" role="group" aria-label="Demo shopper">
              {personas.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === personaId ? 'persona-button is-selected' : 'persona-button'}
                  aria-pressed={item.id === personaId}
                  onClick={() => choosePersona(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          {persona ? (
            <article className="order-card">
              <div>
                <p className="eyebrow">Latest order</p>
                <h2>{persona.order.item}</h2>
                <p>
                  {persona.order.id} · {persona.order.detail} · {persona.order.total}
                </p>
              </div>
              <div>
                <p className="order-status">{persona.order.status}</p>
                <p>{persona.order.statusNote}</p>
              </div>
            </article>
          ) : null}

          <form
            className="search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              const next = query.trim()
              if (next.length > 0) {
                setLaunchQuestion(next)
              }
            }}
          >
            <label className="sr-only" htmlFor="help-search">
              Search help articles
            </label>
            <input
              id="help-search"
              value={query}
              placeholder="Search tracking, returns, Trail Club…"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit">Ask Cove</button>
          </form>

          <div className="topic-grid" id="topics">
            {ARTICLE_CATEGORIES.map((category) => (
              <a key={category} className="topic-card" href={`#category-${category}`}>
                <strong>{category}</strong>
                <span>{TOPIC_COPY[category]}</span>
              </a>
            ))}
          </div>

          <div id="articles">
            {ARTICLE_CATEGORIES.map((category) => {
              const rows = grouped[category] ?? []
              if (rows.length === 0) {
                return null
              }
              return (
                <section key={category} id={`category-${category}`} className="article-group">
                  <h2>{category}</h2>
                  {rows.map((article) => (
                    <article
                      key={article.id}
                      id={`article-${article.id}`}
                      className={article.id === litId ? 'article is-lit' : 'article'}
                    >
                      <h3>{article.title}</h3>
                      <p>{article.summary}</p>
                      <button type="button" className="text-button" onClick={() => setLaunchQuestion(article.prompt)}>
                        Ask Cove · {article.prompt}
                      </button>
                    </article>
                  ))}
                </section>
              )
            })}
          </div>
          <p className="footer-note">Portfolio demo · AI Support Assistant. Northline is fictional.</p>
        </main>

        {personaId ? (
          <ChatDock
            key={personaId}
            personaId={personaId}
            launchQuestion={launchQuestion}
            onLaunchConsumed={consumeLaunch}
            onCitation={onCitation}
          />
        ) : (
          <aside className="dock dock-waiting">
            <p>{loadError ? 'Cove opens once the API is running.' : 'Loading Cove…'}</p>
          </aside>
        )}
      </div>
    </div>
  )
}
