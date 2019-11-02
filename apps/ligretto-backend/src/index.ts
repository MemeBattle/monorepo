import * as dotenv from 'dotenv'
dotenv.config()

if (!process.env) {
  throw Error('Env is not valid. Run yarn env')
}
import './inversify.config'
import './socketIoServer'
