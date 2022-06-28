import https from 'node:https'
import fsPromises from 'node:fs/promises'
import { cpus } from 'node:os'
import express from 'express'

import { addRegisterCheckRoute, deregister, register } from './modules/registration.js'
import { FIL_WALLET_ADDRESS, NODE_OPERATOR_EMAIL, NODE_VERSION, nodeId, PORT, TESTING_CID } from './config.js'
import { streamCAR } from './utils/car.js'
import { trapServer } from './utils/trap.js'
import { debug } from './utils/logging.js'

import cluster from 'node:cluster'
import { submitRetrievals, initLogIngestor } from './modules/log_ingestor.js'

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

  await register(true).catch(err => {
    debug(`Failed to register ${err.name} ${err.message}`)
    process.exit(1)
  })

  // Start log ingestor
  await initLogIngestor()
} else {
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 128 / cpus().length
  })

  const app = express()

  const testCAR = await fsPromises.readFile('./public/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF.car')

  app.disable('x-powered-by')
  app.set('trust proxy', true)

  app.get('/favicon.ico', (req, res) => {
    res.sendStatus(404)
  })

  // Whenever nginx doesn't have a CAR file in cache, this is called
  app.get('/cid/:cid*', async (req, res) => {
    const cid = req.params.cid + req.params[0]
    debug.extend('req')(`Cache miss for ${cid}`)

    res.set({
      'Content-Type': 'application/vnd.ipld.car',
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

    const ipfsReq = https.get(`https://gateway.ipfs.io/api/v0/dag/export?arg=${cid}`, {
      agent, timeout: 60_000, headers: { 'User-Agent': `Saturn/${NODE_VERSION}` }
    }, async fetchRes => {
      const { statusCode } = fetchRes
      let error
      // Any 2xx status code signals a successful response but
      // here we're only checking for 200.
      if (statusCode !== 200) {
        error = new Error(`Request Failed. Status Code: ${statusCode}`)
      }
      if (error) {
        debug.extend('error')(`Error fetching from IPFS gateway: ${error.name} ${error.message}`)
        // Consume response data to free up memory
        fetchRes.resume()
        res.sendStatus(502)
        return
      }

      streamCAR(fetchRes, res).catch(() => {})
    }).on('error', err => {
      debug.extend('error')(`Error fetching from IPFS gateway: ${err.name} ${err.message}`)
      res.sendStatus(502)
    }).on('timeout', err => {
      ipfsReq.destroy(err)
    })
  })

  addRegisterCheckRoute(app)

  const server = app.listen(PORT, '127.0.0.1', async () => {
    debug.extend('server')('shim process running')
  })

  trapServer(server)
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
