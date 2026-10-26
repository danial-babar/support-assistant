import cors from 'cors'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  articleListSchema,
  healthSchema,
  metricsSchema,
  personaListSchema,
} from '@cove/shared'
import { config, isModelEnabled } from './config'
import { listPublicArticles } from './knowledge-base'
import type { ConversationStore } from './store'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(moduleDirectory, '../../web/dist')

/**
 * Builds the HTTP app: JSON API, then the built storefront when it exists.
 *
 * @param store - Inbox backing the metrics route.
 * @returns An Express application. Socket.io attaches to the HTTP server.
 */
export function createHttpApp(store: ConversationStore): Express {
  const app = express()
  app.use(cors({ origin: config.clientOrigin }))
  app.use(express.json({ limit: '32kb' }))

  app.get('/api/health', (_request, response) => {
    response.json(
      healthSchema.parse({
        ok: true,
        service: 'cove',
        modelEnabled: isModelEnabled(),
      }),
    )
  })

  app.get('/api/personas', (_request, response) => {
    response.json(personaListSchema.parse(store.personas()))
  })

  app.get('/api/knowledge', (_request, response) => {
    response.json(articleListSchema.parse(listPublicArticles()))
  })

  app.get('/api/metrics', (_request, response) => {
    response.json(metricsSchema.parse(store.metrics()))
  })

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist))
    app.use((request, response, next) => {
      if (
        request.method !== 'GET' ||
        request.path.startsWith('/api') ||
        request.path.startsWith('/socket.io')
      ) {
        next()
        return
      }
      response.sendFile(path.join(clientDist, 'index.html'), (error) => {
        if (error) {
          next(error)
        }
      })
    })
  }

  app.use((request, response) => {
    response.status(404).json({ message: `No route for ${request.method} ${request.path}` })
  })

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Request failed.'
    response.status(500).json({ message })
  })

  return app
}
