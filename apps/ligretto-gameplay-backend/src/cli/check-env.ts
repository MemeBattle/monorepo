import * as dotenv from 'dotenv'
dotenv.config()

if (!process.env) {
  throw Error('Env is not valid. Run yarn env')
}

const { SOCKET_PORT, LIGRETTO_CORE_URL } = process.env

if (!SOCKET_PORT || !LIGRETTO_CORE_URL) {
  console.log('!SOCKET_PORT || !LIGRETTO_CORE_URL')
  process.exit(-1)
}
