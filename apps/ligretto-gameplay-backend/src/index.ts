import dotenv from '@codexsoft/dotenv-flow'
import path from 'node:path'

dotenv.config({ default_node_env: 'development', path: path.resolve(__dirname, '../../..') })

import './inversify.config'
import './socket-io-server'
