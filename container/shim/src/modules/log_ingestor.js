import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import fetch from 'node-fetch'
import { FIL_WALLET_ADDRESS, LOG_INGESTOR_URL, nodeId, nodeToken } from '../config.js'
import { debug as Debug } from '../utils/logging.js'

const debug = Debug.extend('log-ingestor')

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

  parseLogs()

  setInterval(async () => {
    if (pending.length > 0) {
      const body = {
        nodeId,
        filAddress: FIL_WALLET_ADDRESS,
        bandwidthLogs: pending
      }
      try {
        await fetch(LOG_INGESTOR_URL, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            Authentication: nodeToken,
            'Content-Type': 'application/json'
          }
        })
        debug(`Submitted pending ${pending.length} retrievals to wallet ${FIL_WALLET_ADDRESS}`)
        pending = []
      } catch (err) {
        debug(err)
      }
    }
  }, 60_000)
}

async function parseLogs () {
  const read = await fh.readFile()

  if (read.length > 0) {
    hasRead = true
    const lines = read.toString().trim().split('\n')

    let valid = 0
    let hits = 0
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

        pending.push({
          cacheHit,
          cid,
          clientAddress,
          clientId,
          localTime,
          numBytesSent,
          range,
          referrer,
          requestDuration,
          requestId,
          userAgent
        })
        valid++
        if (cacheHit) hits++
      }
    }
    debug(`Parsed ${valid} valid retrievals with hit rate of ${(hits / valid * 100).toFixed(0)}%`)
  } else {
    if (hasRead) {
      await fh.truncate()
      await fh.close()
      hasRead = false
      fh = await openFileHandle()
    }
  }
  setTimeout(parseLogs, 10_000)
}

async function openFileHandle () {
  return await fsPromises.open('/var/log/nginx/node-access.log', 'r+')
}
