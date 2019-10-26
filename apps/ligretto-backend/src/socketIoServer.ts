import * as SocketIo from 'socket.io'

const server = SocketIo(3005)

server.on('connection', socket => {
  socket.on('message', data => {
    console.log('message', data)
  })

  socket.on('echo', data => {
    console.log('ECHO', data)
    socket.emit(data.type, data.payload)
  })
})
