import { io, type Socket } from 'socket.io-client'

/**
 * Opens a socket on the same origin. Vite proxies `/socket.io` in development.
 *
 * @returns A Socket.io client.
 */
export function createSocket(): Socket {
  return io({ autoConnect: true })
}
