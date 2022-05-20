import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import fetch from 'node-fetch'
import Debug from 'debug'
import { FIL_WALLET_ADDRESS, LOG_INGESTOR_URL, nodeId, nodeToken } from './config.js'

const debug = Debug('node:log-ingestor')

const NGINX_LOG_KEYS_MAP = {
  addr: 'clientAddress',
  b: 'numBytesSent',
  lt: 'localTime',
  r: 'request',
  ref: 'referrer',
  rid: 'requestId',
  rt: 'requestDuration',
  s: 'status',
  ua: 'userAgent',
  ucs: 'cacheHit'
}

let pending = []
let fh, hasRead

if (fs.existsSync('/var/log/nginx/node-access.log')) {
  debug('Reading nginx log file')
  fh = await openFileHandle()

  setInterval(async () => {
    const read = await fh.readFile()

    if (read.length > 0) {
      hasRead = true
      const lines = read.toString().trim().split('\n')

      for (const line of lines) {
        const vars = line.split('&&').reduce((varsAgg, currentValue) => {
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
            case 'lt':
            case 'rid':
            case 'addr': {
              parsedValue = jointValue
              break
            }
            case 'ucs': {
              parsedValue = jointValue === 'HIT'
              break
            }
            default: {
              const numberValue = Number.parseFloat(jointValue)
              parsedValue = Number.isNaN(numberValue) ? jointValue : numberValue
            }
          }
          return Object.assign(varsAgg, { [NGINX_LOG_KEYS_MAP[name] || name]: parsedValue })
        }, {})

        if (vars.request?.startsWith('/cid/') && vars.status === 200) {
          const { clientAddress, numBytesSent, request, requestId, localTime, requestDuration, args, range, cacheHit, referrer, userAgent } = vars
          const cid = request.replace('/cid/', '')
          const { clientId } = args
          debug(`Client ${clientId} at ${clientAddress} from ${referrer} requested ${cid} range: ${range} size: ${Math.floor(numBytesSent / 1024)} KB HIT:${cacheHit} duration: ${requestDuration}ms RID: ${requestId}`)

          pending.push({
            cacheHit,
            cid,
            clientAddress,
            clientId,
            localTime,
            numBytesSent,
            range,
            requestDuration,
            requestId,
            userAgent
          })
        }
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

  setInterval(async () => {
    if (pending.length > 0) {
      debug(`Submitting pending ${pending.length} retrievals to wallet ${FIL_WALLET_ADDRESS}`)
      const body = {
        nodeId,
        filAddress: FIL_WALLET_ADDRESS,
        bandwidthLogs: pending
      }
      await fetch(LOG_INGESTOR_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          Authentication: nodeToken,
          'Content-Type': 'application/json'
        }
      })
      pending = []
    }
  }, 60_000)
}

async function openFileHandle () {
  return await fsPromises.open('/var/log/nginx/node-access.log', 'r+')
}
