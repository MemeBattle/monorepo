import { readFileSync } from 'fs'
import { resolve } from 'path'

export const { SOCKET_PORT, PARTNER_ID, CAS_URL } = process.env

export const SOCKET_ROOM_LOBBY = 'SOCKET_ROOM_LOBBY'
export const PUBLIC_KEY = readFileSync(resolve(__dirname, '../key.pem')).toString()
