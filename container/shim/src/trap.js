import Debug from 'debug'
import { deregister } from './registration.js'

const debug = Debug('node:trap')

const shutdown = (server) => async () => {
  debug('shutting down server')
  await deregister()
  server.close(() => {
    debug('server closed')
    process.exit()
  })
}

export const trapServer = (server) => {
  process.on('SIGQUIT', shutdown(server))
  process.on('SIGINT', shutdown(server))
}
