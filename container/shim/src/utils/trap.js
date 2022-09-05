import { debug as Debug } from './logging.js'
import { deregister } from '../modules/registration.js'

const debug = Debug.extend('trap')

const shutdownServer = (server) => () => {
  debug('Shutting down server')
  server.close(() => {
    debug('Server closed')
    process.exit()
  })
}

const drainServer = () => {
  debug('Draining server')
  deregister()
}

export const trapServer = (server) => {
  process.on('SIGQUIT', shutdownServer(server))
  process.on('SIGINT', shutdownServer(server))
  process.on('SIGPIPE', drainServer)
}
