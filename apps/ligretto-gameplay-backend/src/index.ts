// Must stay the first import: it imports `./config`, which loads the environment every other module reads.
import './cli/check-env'
import './inversify.config'
import './socket-io-server'
