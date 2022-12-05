import { debug as Debug } from './logging.js'
import { deregister } from '../modules/registration.js'

const debug = Debug.extend('trap')

const shutdownServer = (server, signal) => () => {
  debug(`Shutting down server with signal ${signal}`)
  server.close(() => {
    debug('Server closed')
    process.exit(0)
  })
}

const drainServer = () => {
  debug('Draining server')
  deregister()
}

export const trapServer = (server) => {
  process.on('SIGQUIT', shutdownServer(server, 'SIGQUIT'))
  process.on('SIGINT', shutdownServer(server, 'SIGINT'))
  process.on('SIGTERM', drainServer)
}
