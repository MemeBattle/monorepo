import { readFileSync } from 'fs'
import { resolve } from 'path'

export const { SOCKET_PORT, PARTNER_ID, CAS_URL, LIGRETTO_CAS_KEY_PATH } = process.env

export const SOCKET_ROOM_LOBBY = 'SOCKET_ROOM_LOBBY'

const PATH_TO_KEY = LIGRETTO_CAS_KEY_PATH || resolve(__dirname, '../key.pem')

export const PUBLIC_KEY = readFileSync(PATH_TO_KEY).toString()
