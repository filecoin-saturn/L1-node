import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import fetch from 'node-fetch'
import prettyBytes from 'pretty-bytes'
import logfmt from 'logfmt'

import { FIL_WALLET_ADDRESS, LOG_INGESTOR_URL, nodeId, nodeToken, TESTING_CID } from '../config.js'
import { debug as Debug } from '../utils/logging.js'

const debug = Debug.extend('log-ingestor')

const NGINX_LOG_KEYS_MAP = {
  clientAddress: (values) => values.addr,
  numBytesSent: (values) => parseInt(values.bytes, 10),
  localTime: (values) => values.time,
  referrer: (values) => values.ref,
  requestId: (values) => values.id,
  requestDuration: (values) => parseFloat(values.rt),
  status: (values) => parseInt(values.status, 10),
  httpProtocol: (values) => values.sp,
  userAgent: (values) => values.ua,
  cacheHit: (values) => values.cache === 'HIT',
  url: (values) => {
    const url = new URL(`${values.scheme}://${values.host}${values.uri}`)
    url.searchParams.set('ua', values.ua)
    url.searchParams.set('rid', values.id)
    return url
  },
  range: (values) => values.range,
  ff: (values) => values.ff,
  uct: (values) => {
    const parsed = parseFloat(values.uct)
    return isNaN(parsed) ? values.uct : parsed
  },
  uht: (values) => {
    const parsed = parseFloat(values.uht)
    return isNaN(parsed) ? values.uht : parsed
  },
  urt: (values) => {
    const parsed = parseFloat(values.urt)
    return isNaN(parsed) ? values.urt : parsed
  }
}
const IPFS_PREFIX = '/ipfs/'
const IPNS_PREFIX = '/ipns/'

const ONE_GIGABYTE = 1073741823

let pending = []
let fh, hasRead
let parseLogsTimer
let submitRetrievalsTimer

export async function initLogIngestor () {
  if (fs.existsSync('/var/log/nginx/node-access.log')) {
    debug('Reading nginx log file')
    fh = await openFileHandle()

    parseLogs()

    submitRetrievals()
  }
}

async function parseLogs () {
  clearTimeout(parseLogsTimer)
  const stat = await fh.stat()

  if (stat.size >= ONE_GIGABYTE) {
    // Got to big we can't read it into single string
    // TODO: stream read it
    await fh.truncate()
  }

  const read = await fh.readFile()

  let valid = 0
  let hits = 0
  if (read.length > 0) {
    hasRead = true
    const lines = read.toString().trim().split('\n')

    for (const line of lines) {
      const parsed = logfmt.parse(line)
      const vars = Object.entries(NGINX_LOG_KEYS_MAP).reduce((acc, [key, getter]) => {
        acc[key] = getter(parsed)
        return acc
      }, {})
      let urlObj

      try {
        urlObj = new URL(vars.url)
      } catch (err) {
        debug(`Invalid URL: ${vars.url}`)
        continue
      }

      const isIPFS = urlObj.pathname.startsWith(IPFS_PREFIX)
      const isIPNS = urlObj.pathname.startsWith(IPNS_PREFIX)

      if (!isIPFS && !isIPNS) {
        continue
      }

      const {
        clientAddress, numBytesSent, requestId, localTime, status,
        requestDuration, range, cacheHit, referrer, userAgent, http3,
        httpProtocol, url
      } = vars

      const cid = urlObj.pathname.split('/')[2]

      if (cid === TESTING_CID) continue

      pending.push({
        cacheHit,
        clientAddress,
        localTime,
        numBytesSent,
        range,
        referrer,
        requestDuration,
        requestId,
        userAgent,
        httpStatusCode: status,
        // If/when "httpProtocol" eventually contains HTTP/3.0, then
        // the "http3" key can be removed.
        httpProtocol: (http3 || httpProtocol),
        url
      })

      valid++
      if (cacheHit) hits++
    }
    if (valid > 0) {
      debug(`Parsed ${valid} valid retrievals in ${prettyBytes(read.length)} with hit rate of ${Number((hits / valid * 100).toFixed(2))}%`)
    }
  } else {
    if (hasRead) {
      await fh.truncate()
      await fh.close()
      hasRead = false
      fh = await openFileHandle()
    }
  }
  parseLogsTimer = setTimeout(parseLogs, Math.max(10_000 - valid, 1000))
}

async function openFileHandle () {
  return await fsPromises.open('/var/log/nginx/node-access.log', 'r+')
}

export async function submitRetrievals () {
  clearTimeout(submitRetrievalsTimer)
  const length = pending.length
  if (length > 0) {
    const body = {
      nodeId,
      filAddress: FIL_WALLET_ADDRESS,
      bandwidthLogs: pending
    }
    pending = []
    try {
      debug(`Submitting ${length} pending retrievals`)
      const startTime = Date.now()
      await fetch(LOG_INGESTOR_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          Authentication: nodeToken,
          'Content-Type': 'application/json'
        }
      })
      debug(`Submitted ${length} retrievals to wallet ${FIL_WALLET_ADDRESS} in ${Date.now() - startTime}ms`)
    } catch (err) {
      debug(`Failed to submit pending retrievals ${err.name} ${err.message}`)
      pending = body.bandwidthLogs.concat(pending)
    }
  }
  submitRetrievalsTimer = setTimeout(submitRetrievals, Math.max(60_000 - length, 10_000))
}
