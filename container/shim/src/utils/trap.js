import { debug as Debug } from './logging.js'

const debug = Debug.extend('trap')

const shutdownServer = (server) => () => {
  debug('shutting down server')
  server.close(() => {
    debug('server closed')
    process.exit()
  })
}

export const trapServer = (server) => {
  process.on('SIGQUIT', shutdownServer(server))
  process.on('SIGINT', shutdownServer(server))
}
