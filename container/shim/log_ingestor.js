import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import Debug from 'debug'
import { FIL_WALLET_ADDRESS } from './config.js'

const debug = Debug('server:log-ingestor')

const NGINX_LOG_KEYS_MAP = {
  addr: 'address',
  b: 'bytes',
  r: 'request',
  s: 'status'
}

let pending = {}
let fh, hasRead

if (fs.existsSync('/var/log/nginx/gateway-access.log')) {
  debug('Reading nginx log file')
  fh = await openFileHandle()

  setInterval(async () => {
    const read = await fh.readFile()

    if (read.length > 0) {
      hasRead = true
      const lines = read.toString().trim().split('\n')

      for (const line of lines) {
        const vars = line.split('&&').reduce(((varsAgg, currentValue) => {
          const [name, ...value] = currentValue.split('=')
          const jointValue = value.join('=')

          let parsedValue
          switch (name) {
            case 'args': {
              parsedValue = jointValue.split('&').reduce((argsAgg, current) => {
                const [name, ...value] = current.split('=')
                return Object.assign(argsAgg, { [name]: value.join('=') })
              }, {})
              break
            }
            case 'addr': {
              parsedValue = jointValue
              break
            }
            default: {
              const numberValue = Number.parseFloat(jointValue)
              parsedValue = Number.isNaN(numberValue) ? jointValue : numberValue
            }
          }
          return Object.assign(varsAgg, { [NGINX_LOG_KEYS_MAP[name] || name]: parsedValue })
        }), {})
        debug('%o', vars)
        if (!vars.request?.startsWith('/cid/') || vars.status !== 200) {
          continue
        }
        const { bytes, request, args } = vars
        const cid = request.replace('/cid/', '')
        const { rcid } = args
        debug('%s (%d) from %s', cid, bytes, rcid)
        if (!pending[cid]) {
          pending[cid] = 0
        }
        pending[cid] += bytes
      }

    } else {
      if (hasRead) {
        await fh.truncate()
        await fh.close()
        hasRead = false
        fh = await openFileHandle()
      }
    }
  }, 10_000)

  setInterval(() => {
    if (Object.keys(pending).length > 0) {
      debug('Submitting pending retrievals %o to Wallet %s', pending, FIL_WALLET_ADDRESS)
      pending = {}
    }
  }, 60_000)
}

async function openFileHandle() {
  return await fsPromises.open('/var/log/nginx/gateway-access.log', 'r+')
}