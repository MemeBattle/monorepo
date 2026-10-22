import { CAS_ISSUER, LIGRETTO_CORE_URL, LIGRETTO_GAMEPLAY_SOCKET_PORT } from '../config'

// Without CAS_ISSUER every handshake fails on unreadable discovery metadata: refusing to start is cheaper to diagnose.
if (!LIGRETTO_GAMEPLAY_SOCKET_PORT || !LIGRETTO_CORE_URL || !CAS_ISSUER) {
  console.log('!LIGRETTO_GAMEPLAY_SOCKET_PORT || !LIGRETTO_CORE_URL || !CAS_ISSUER')
  process.exit(-1)
}
