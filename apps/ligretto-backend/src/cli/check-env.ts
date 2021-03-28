import * as dotenv from 'dotenv'
dotenv.config()

if (!process.env) {
  throw Error('Env is not valid. Run yarn env')
}

const { SOCKET_PORT } = process.env

if (!SOCKET_PORT) {
  console.log('!SOCKET_PORT')
  process.exit(-1)
}
