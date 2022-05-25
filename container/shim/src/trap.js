import { deregister } from './registration.js'
import { debug as Debug } from './logging.js'

const debug = Debug.extend('trap')

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
