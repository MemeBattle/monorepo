import { CAS_ISSUER, LIGRETTO_CORE_URL, LIGRETTO_GAMEPLAY_SOCKET_PORT, LIGRETTO_INTERNAL_API_TOKEN } from '../config'

// Without CAS_ISSUER every handshake fails on unreadable discovery metadata, and without the internal API's base or
// secret every game creation fails: refusing to start is cheaper to diagnose.
if (!LIGRETTO_GAMEPLAY_SOCKET_PORT || !LIGRETTO_CORE_URL || !CAS_ISSUER || !LIGRETTO_INTERNAL_API_TOKEN) {
  console.log('!LIGRETTO_GAMEPLAY_SOCKET_PORT || !LIGRETTO_CORE_URL || !CAS_ISSUER || !LIGRETTO_INTERNAL_API_TOKEN')
  process.exit(-1)
}
