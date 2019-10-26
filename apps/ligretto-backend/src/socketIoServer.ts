import * as SocketIo from 'socket.io'

const server = SocketIo(3005)

server.on('connection', socket => {
  socket.on('event', data => {
    console.log('event', data)
  })
})
