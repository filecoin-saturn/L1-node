import { randomUUID } from 'node:crypto'
import https from 'node:https'
import fsPromises from 'node:fs/promises'
import express from 'express'

import { addRegisterCheckRoute, register } from './modules/registration.js'
import { FIL_WALLET_ADDRESS, NGINX_PORT, NODE_OPERATOR_EMAIL, NODE_VERSION, nodeId, PORT } from './config.js'
import { streamCAR } from './utils/utils.js'
import { trapServer } from './utils/trap.js'
import { debug } from './utils/logging.js'
import { certExists } from './modules/tls.js'

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
  if (cid === 'QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF') {
    return res.send(testCAR)
  }

  https.get(`https://ipfs.io/api/v0/dag/export?arg=${cid}`, async fetchRes => {
    streamCAR(fetchRes, res).catch(debug)
  })
})

addRegisterCheckRoute(app)

const server = app.listen(PORT, '127.0.0.1', async () => {
  debug.extend('version')(`${NODE_VERSION}`)
  debug(`shim running on http://localhost:${PORT}`)
  if (certExists) {
    debug(`nginx caching proxy running on https://localhost:${NGINX_PORT}. Test at https://localhost:${NGINX_PORT}/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF?clientId=${randomUUID()}`)
  }
  debug.extend('address')('===== IMPORTANT =====')
  debug.extend('address')(`Earnings will be sent to Filecoin wallet address: ${FIL_WALLET_ADDRESS}`)
  debug.extend('address')(NODE_OPERATOR_EMAIL ? `Payment notifications and important update will be sent to: ${NODE_OPERATOR_EMAIL}` : 'NO OPERATOR EMAIL SET, WE HIGHLY RECOMMEND SETTING ONE')
  debug.extend('address')('===== IMPORTANT =====')

  await register(true).catch((err) => {
    debug(err)
    process.exit(1)
  })

  // Start log ingestor
  import('./modules/log_ingestor.js')
})

trapServer(server)
