import { debug as Debug } from './logging.js'

const debug = Debug.extend('trap')

const shutdownServer = (server) => () => {
  debug('Shutting down server')
  server.close(() => {
    debug('Server closed')
    process.exit()
  })
}

export const trapServer = (server) => {
  process.on('SIGQUIT', shutdownServer(server))
  process.on('SIGINT', shutdownServer(server))
}
