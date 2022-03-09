import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import Debug from 'debug'

const debug = Debug('server:log-ingestor')

const NGINX_LOG_KEYS_MAP = {
  r: 'request',
  b: 'bytes'
}

let pending = {}

if (fs.existsSync('/var/log/nginx/gateway-access.log')) {
  debug('Reading nginx log file')
  const fh = await fsPromises.open('/var/log/nginx/gateway-access.log', 'r+')

  setInterval(async () => {
    const read = await fh.read()
    if (read.bytesRead > 0) {
      const lines = read.buffer.slice(0, read.bytesRead).toString().trim().split('\n')

      for (const line of lines) {
        const vars = line.split('&&').reduce(((previousValue, currentValue) => {
          const [name, ...value] = currentValue.split('=')
          const jointValue = value.join('')
          const numberValue = Number.parseFloat(jointValue)
          const parsedValue = Number.isNaN(numberValue) ? jointValue : numberValue
          return Object.assign(previousValue, { [NGINX_LOG_KEYS_MAP[name] || name]: parsedValue })
        }), {})
        debug('%o', vars)
        if (!vars.request.startsWith('/cid/')) {
          continue
        }
        const cid = vars.request.replace('/cid/', '')
        if (!pending[cid]) {
          pending[cid] = 0
        }
        pending[cid] += vars.bytes
      }

    } else {
      fh.truncate().catch(debug)
    }
  }, 5000)

  setInterval(() => {
    if (Object.keys(pending).length > 0) {
      debug('Sending pending retrievals %o', pending)
      pending = {}
    } else {
      debug('No pending retrievals')
    }
  }, 60_000)
}