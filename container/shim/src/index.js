import fsPromises from 'node:fs/promises'
import { cpus } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import mimeTypes from 'mime-types'
import followRedirects from 'follow-redirects'

import { addRegisterCheckRoute } from './modules/registration.js'
import {
  NODE_UA,
  NODE_VERSION,
  nodeId,
  TESTING_CID,
  IPFS_GATEWAY_ORIGIN
} from './config.js'
import { streamCAR } from './utils/car.js'
import { debug } from './utils/logging.js'

const { https } = followRedirects

const GATEWAY_TIMEOUT = 120_000
const PROXY_RESPONSE_HEADERS = [
  'content-disposition',
  'content-type',
  'content-length',
  'cache-control',
  'etag',
  'last-modified',
  'location',
  'x-ipfs-path',
  'x-ipfs-roots',
  'x-ipfs-datasize',
  'x-content-type-options'
]

const ipfsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: Math.floor(128 / cpus().length)
})

const app = express()

const testCAR = await fsPromises.readFile(join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF.car'
))

app.disable('x-powered-by')
app.set('trust proxy', true)

app.get('/favicon.ico', (req, res) => {
  res.sendStatus(404)
})

// Whenever nginx doesn't have a CAR file in cache, this is called
app.get('/ipfs/:cid', handleCID)
app.get('/ipfs/:cid/:path*', handleCID)

async function handleCID (req, res) {
  const cid = req.params.cid
  const format = getResponseFormat(req)

  debug(`Cache miss for ${req.path}`)

  res.set({
    'Content-Type': mimeTypes.lookup(req.path) || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Saturn-Node-Id': nodeId,
    'Saturn-Node-Version': NODE_VERSION
  })

  if (req.headers.range) {
    let [start, end] = req.headers.range.split('=')[1].split('-')
    start = parseInt(start, 10)
    end = parseInt(end, 10)

    res.set({
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${testCAR.length}`
    })
    return res.status(206).end(testCAR.slice(start, end + 1))
  }

  // Testing CID
  if (cid === TESTING_CID) {
    return res.send(testCAR)
  }

  const ipfsUrl = new URL(IPFS_GATEWAY_ORIGIN + req.path)
  if (format) {
    ipfsUrl.searchParams.set('format', format)
  }
  for (const key of ['filename', 'download']) {
    if (key in req.query) {
      ipfsUrl.searchParams.set(key, req.query[key])
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, GATEWAY_TIMEOUT)

  const ipfsReq = https.get(ipfsUrl, {
    agent: ipfsAgent,
    timeout: GATEWAY_TIMEOUT,
    headers: { 'User-Agent': NODE_UA },
    signal: controller.signal
  }, async fetchRes => {
    clearTimeout(timeout)
    const { statusCode } = fetchRes
    if (statusCode >= 400) {
      debug.extend('error')(`Invalid response from IPFS gateway (${statusCode}) for ${cid}`)
    }

    res.status(statusCode)
    proxyResponseHeaders(fetchRes, res)

    if (format === 'car') {
      streamCAR(fetchRes, res).catch(() => {})
    } else {
      fetchRes.pipe(res)
    }
  }).on('error', err => {
    clearTimeout(timeout)
    debug.extend('error')(`Error fetching from IPFS gateway for ${cid}: ${err.name} ${err.message}`)
    if (controller.signal.aborted) {
      return res.sendStatus(504)
    }
    res.sendStatus(502)
  }).on('timeout', () => {
    clearTimeout(timeout)
    debug.extend('error')(`Timeout from IPFS gateway for ${cid}`)
    ipfsReq.destroy()
    res.destroy()
  })

  req.on('close', () => {
    clearTimeout(timeout)
    if (!res.writableEnded) {
      debug.extend('error')('Client aborted early, terminating gateway request')
      ipfsReq.destroy()
    }
  })
}

addRegisterCheckRoute(app)

export default app

// https://github.com/ipfs/specs/blob/main/http-gateways/PATH_GATEWAY.md#response-headers
function proxyResponseHeaders (ipfsRes, nodeRes) {
  for (const key of PROXY_RESPONSE_HEADERS) {
    if (key in ipfsRes.headers) {
      nodeRes.set(key, ipfsRes.headers[key])
    }
  }
}

function getResponseFormat (req) {
  // ipfs gw returns default format for invalid formats
  if (req.query.format) {
    return req.query.format
  } else if (req.headers.accept === 'application/vnd.ipld.car') {
    return 'car'
  } else if (req.headers.accept === 'application/vnd.ipld.raw') {
    return 'raw'
  } else {
    return null
  }
}
