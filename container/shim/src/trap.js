import Debug from 'debug'

const debug = Debug('node:trap')

const shutdown = (server) => () => {
  debug('shutting down server')
  clearInterval(server.registerInterval)
  server.close(() => {
    debug('server closed')
    process.exit()
  })
}

export const trapServer = (server) => {
  process.on('SIGQUIT', shutdown(server))
  process.on('SIGINT', shutdown(server))
}