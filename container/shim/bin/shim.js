import app from '../src/index.js'
import parseArgs from 'minimist'
import http from 'node:http'

import { deregister, register } from '../src/modules/registration.js'
import {
  FIL_WALLET_ADDRESS,
  NODE_OPERATOR_EMAIL,
  NODE_VERSION,
  nodeId,
  PORT
} from '../src/config.js'
import { trapServer } from '../src/utils/trap.js'
import { debug } from '../src/utils/logging.js'

import { submitRetrievals, initLogIngestor } from '../src/modules/log_ingestor.js'

const argv = parseArgs(process.argv.slice(2))

debug('Saturn L1 Node')
debug.extend('id')(nodeId)
debug.extend('version')(NODE_VERSION)
debug.extend('important')('===== IMPORTANT =====')
debug.extend('important')(`Earnings will be sent to Filecoin wallet address: ${FIL_WALLET_ADDRESS}`)
debug.extend('important')(NODE_OPERATOR_EMAIL ? `Payment notifications and important update will be sent to: ${NODE_OPERATOR_EMAIL}` : 'NO OPERATOR EMAIL SET, WE HIGHLY RECOMMEND SETTING ONE')
debug.extend('important')('===== IMPORTANT =====')

process.on('SIGQUIT', shutdown)
process.on('SIGINT', shutdown)

setTimeout(async function () {
  if (argv.register !== false) {
    await register(true).catch(err => {
      debug(`Failed to register ${err.name} ${err.message}`)
      process.exit(1)
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
      deregister()
    ])
  } catch (err) {
    debug(`Failed during shutdown: ${err.name} ${err.message}`)
  } finally {
    debug('Exiting...')
    process.exit(0)
  }
}
