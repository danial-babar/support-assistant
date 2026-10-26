import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { config } from './config'
import { createHttpApp } from './http'
import { registerRealtime } from './realtime'
import { ConversationStore } from './store'

/** A running Cove process. */
export interface RunningServer {
  readonly port: number
  /** Closes sockets and the HTTP server. */
  close: () => Promise<void>
}

/**
 * Starts the API, the realtime inbox, and the static client when it is built.
 *
 * @param port - Port to bind. `0` asks the OS for a free port.
 * @returns The bound port and a close function.
 */
export function startServer(port: number): Promise<RunningServer> {
  const store = new ConversationStore()
  const app = createHttpApp(store)
  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigin,
      methods: ['GET', 'POST'],
    },
  })
  registerRealtime(io, store)

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, () => {
      const address = httpServer.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      resolve({
        port: boundPort,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            io.close()
            httpServer.close((error) => {
              if (error) {
                closeReject(error)
                return
              }
              closeResolve()
            })
          }),
      })
    })
  })
}
