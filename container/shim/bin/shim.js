import http from 'node:http'
import { validateAddressString } from '@glif/filecoin-address'

import app from '../src/index.js'
import { deregister, register } from '../src/modules/registration.js'
import {
  FIL_WALLET_ADDRESS,
  NODE_OPERATOR_EMAIL,
  NODE_VERSION,
  nodeId,
  PORT,
  ORCHESTRATOR_REGISTRATION, SATURN_NETWORK
} from '../src/config.js'
import { trapServer } from '../src/utils/trap.js'
import { debug } from '../src/utils/logging.js'
import { submitRetrievals, initLogIngestor } from '../src/modules/log_ingestor.js'

debug('Saturn L1 Node')
debug.extend('id')(nodeId)
debug.extend('version')(NODE_VERSION)

if (!validateAddressString(FIL_WALLET_ADDRESS)) throw new Error('Invalid wallet address')
if (!FIL_WALLET_ADDRESS.startsWith('f') && SATURN_NETWORK === 'main') throw new Error('Invalid testnet wallet address for Saturn Main Network')

debug.extend('important')('===== IMPORTANT =====')
debug.extend('important')(`Earnings will be sent to Filecoin wallet address: ${FIL_WALLET_ADDRESS}`)
debug.extend('important')(`Payment notifications and important updates will be sent to: ${NODE_OPERATOR_EMAIL}`)
debug.extend('important')('===== IMPORTANT =====')

process.on('SIGQUIT', shutdown)
process.on('SIGINT', shutdown)

setTimeout(async function () {
  if (ORCHESTRATOR_REGISTRATION) {
    await register(true).catch(err => {
      debug(`Failed to register ${err.name} ${err.message}`)
      // we don't try again if we fail the initial registration
      process.exit(0)
    })
  }

  // Start log ingestor
  await initLogIngestor()
}, 500)

const server = http.createServer(app)
server.listen(PORT, '127.0.0.1', async () => {
  debug.extend('server')('shim process running')
})

server.keepAliveTimeout = 60 * 60 * 1000

trapServer(server)

async function shutdown () {
  try {
    await Promise.allSettled([
      submitRetrievals(),
      ORCHESTRATOR_REGISTRATION ? deregister() : Promise.resolve()
    ])
  } catch (err) {
    debug(`Failed during shutdown: ${err.name} ${err.message}`)
  } finally {
    debug('Exiting...')
    process.exit(0)
  }
}
