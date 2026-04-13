import { io, Socket } from 'socket.io-client'

let socket: Socket | undefined

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: true })
  }
  return socket
}
