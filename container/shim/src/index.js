import fs from 'node:fs'
import http from 'node:http'
import { cpus } from 'node:os'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import mimeTypes from 'mime-types'
import followRedirects from 'follow-redirects'
import parseArgs from 'minimist'
import httpAssert from 'http-assert'
import fetch, { AbortError } from 'node-fetch'

import { handleRegisterCheck, deregister, register } from './modules/registration.js'
import {
  FIL_WALLET_ADDRESS,
  NODE_OPERATOR_EMAIL,
  NODE_UA,
  NODE_VERSION,
  nodeId,
  PORT,
  TESTING_CID,
  IPFS_GATEWAY_ORIGIN
} from './config.js'
import { streamCAR } from './utils/car.js'
import { trapServer } from './utils/trap.js'
import { debug } from './utils/logging.js'

import cluster from 'node:cluster'
import { submitRetrievals, initLogIngestor } from './modules/log_ingestor.js'

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

const argv = parseArgs(process.argv.slice(2))

class L1Node {
  constructor () {
    this.ipfsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: Math.floor(128 / cpus().length)
    })
    this.testCAR = fs.readFileSync('./public/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF.car')
  }

  async listen () {
    const server = http.createServer((req, res) => {
      const start = new Date()
      this.handle(req, res)
        .catch(err => {
          debug.extend('server')('error', err)
          res.statusCode = err.statusCode || 500
          let msg
          if (err.expose) {
            msg = err.message
          } else if (process.env.NODE_ENV !== 'production') {
            msg = err.stack
          } else {
            msg = 'Internal Server Error'
          }
          res.end(msg)
        })
        .then(() => {
          debug.extend('server')('request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: new Date() - start
          })
        })
    })
    await promisify(server.listen.bind(server))(PORT, '127.0.0.1')
    debug.extend('server')('shim process running')
    server.keepAliveTimeout = 60 * 60 * 1000
    trapServer(server)
    return server
  }

  async handle (req, res) {
    const segs = req.url.split('/').slice(1)

    // GET /ipfs/:cid/:path?
    if (req.method === 'GET' && segs[0] === 'ipfs') {
      return this.handleCID(req, res, { cid: segs[1] })
    }

    // POST /register-check
    if (req.method === 'POST' && segs[0] === 'register-check') {
      return handleRegisterCheck(req, res)
    }

    httpAssert.fail(404)
  }

  // Whenever nginx doesn't have a CAR file in cache, this is called
  async handleCID (req, res, { cid }) {
    const format = getResponseFormat(req)

    debug(`Cache miss for ${req.path}`)

    res.setHeader('Content-Type', mimeTypes.lookup(req.path) || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Saturn-Node-Id', nodeId)
    res.setHeader('Saturn-Node-Version', NODE_VERSION)

    if (req.headers.range) {
      let [start, end] = req.headers.range.split('=')[1].split('-')
      start = parseInt(start, 10)
      end = parseInt(end, 10)

      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Range', `bytes ${start}-${end}/${this.testCAR.length}`)
      return res.end(this.testCAR.slice(start, end + 1))
    }

    // Testing CID
    if (cid === TESTING_CID) {
      return res.end(this.testCAR)
    }

    const ipfsUrl = new URL(IPFS_GATEWAY_ORIGIN + req.path)
    if (format) {
      ipfsUrl.searchParams.set('format', format)
    }
    const { searchParams } = new URL(req.url)
    for (const key of ['filename', 'download']) {
      if (searchParams.has(key)) {
        ipfsUrl.searchParams.set(key, searchParams.get(key))
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, GATEWAY_TIMEOUT)

    let fetchRes
    try {
      fetchRes = await fetch(ipfsUrl, {
        agent: this.ipfsAgent,
        timeout: GATEWAY_TIMEOUT,
        headers: { 'User-Agent': NODE_UA },
        signal: controller.signal
      })
    } catch (err) {
      if (err instanceof AbortError) {
        debug.extend('error')(`Timeout from IPFS gateway for ${cid}`)
        res.destroy()
      } else {
        debug.extend('error')(`Error fetching from IPFS gateway for ${cid}: ${err.name} ${err.message}`)
        httpAssert(!controller.signal.aborted, 504)
        httpAssert.fail(502)
      }
      return
    } finally {
      clearTimeout(timeout)
    }

    const { status } = fetchRes
    if (status >= 400) {
      debug.extend('error')(`Invalid response from IPFS gateway (${status}) for ${cid}`)
    }

    res.statusCode = status
    proxyResponseHeaders(fetchRes, res)

    if (format === 'car') {
      await streamCAR(fetchRes.body, res)
    } else {
      await pipeline(fetchRes.body, res)
    }
  }
}

if (cluster.isPrimary) {
  debug('Saturn L1 Node')
  debug.extend('id')(nodeId)
  debug.extend('version')(NODE_VERSION)
  debug.extend('important')('===== IMPORTANT =====')
  debug.extend('important')(`Earnings will be sent to Filecoin wallet address: ${FIL_WALLET_ADDRESS}`)
  debug.extend('important')(NODE_OPERATOR_EMAIL ? `Payment notifications and important update will be sent to: ${NODE_OPERATOR_EMAIL}` : 'NO OPERATOR EMAIL SET, WE HIGHLY RECOMMEND SETTING ONE')
  debug.extend('important')('===== IMPORTANT =====')

  for (let i = 0; i < cpus().length; i++) {
    cluster.fork()
  }

  cluster.on('exit', () => {
    if (Object.keys(cluster.workers).length === 0) {
      debug('All servers closed')
      shutdownCluster()
    }
  })

  process.on('SIGQUIT', shutdownCluster)
  process.on('SIGINT', shutdownCluster)

  setTimeout(async function () {
    if (argv.register !== false) {
      await register(true).catch(err => {
        debug(`Failed to register ${err.name} ${err.message}`)
        process.exit(1)
      })
    }

    // Start log ingestor
    await initLogIngestor()
  }, 500)
} else {
  const l1Node = new L1Node()
  await l1Node.listen()
}

// https://github.com/ipfs/specs/blob/main/http-gateways/PATH_GATEWAY.md#response-headers
function proxyResponseHeaders (ipfsRes, nodeRes) {
  for (const key of PROXY_RESPONSE_HEADERS) {
    if (key in ipfsRes.headers) {
      nodeRes.setHeader(key, ipfsRes.headers[key])
    }
  }
}

function getResponseFormat (req) {
  const url = new URL(req.url)
  // ipfs gw returns default format for invalid formats
  if (url.searchParams.get('format')) {
    return url.searchParams.get('format')
  } else if (req.headers.accept === 'application/vnd.ipld.car') {
    return 'car'
  } else if (req.headers.accept === 'application/vnd.ipld.raw') {
    return 'raw'
  } else {
    return null
  }
}

async function shutdownCluster () {
  try {
    await Promise.allSettled([
      submitRetrievals(),
      deregister()
    ])
  } catch (err) {
    debug(`Failed during shutdown: ${err.name} ${err.message}`)
  } finally {
    if (Object.keys(cluster.workers).length === 0) {
      debug('Exiting...')
      process.exit(0)
    }
  }
}
