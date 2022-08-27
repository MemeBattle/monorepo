import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import dotenv from '@codexsoft/dotenv-flow'

dotenv.config({ default_node_env: 'development', path: resolve(__dirname, '../../..'), silent: true })

export const { LIGRETTO_GAMEPLAY_SOCKET_PORT, CAS_PARTNER_ID = '', CAS_URL = '', LIGRETTO_GAMEPLAY_CAS_KEY_PATH, LIGRETTO_CORE_URL } = process.env

export const SOCKET_ROOM_LOBBY = 'SOCKET_ROOM_LOBBY'

const PATH_TO_KEY = LIGRETTO_GAMEPLAY_CAS_KEY_PATH || resolve(__dirname, '../key.pem')

export const PUBLIC_KEY = readFileSync(PATH_TO_KEY).toString()
