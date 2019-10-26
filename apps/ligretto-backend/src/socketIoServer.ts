import * as SocketIo from 'socket.io'
import { SOCKET_PORT } from './config'

const server = SocketIo(SOCKET_PORT)

server.on('connection', socket => {
  socket.on('message', data => {
    console.log('message', data)
  })

  socket.on('echo', data => {
    console.log('ECHO', data)
    socket.emit(data.type, data.payload)
  })
})
