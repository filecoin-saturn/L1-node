import * as crypto from 'node:crypto'
import https from 'node:https'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import express from 'express'
import Debug from 'debug'
import fetch from 'node-fetch'
import { NGINX_PORT, ORCHESTRATOR_URL, PORT } from './config.js'
import { streamCAR } from './utils.js'

const debug = Debug('server')
const app = express()

const testCAR = await fsPromises.readFile('./QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF.car')

const nodeID = crypto.randomBytes(4).toString('hex')
const nodeSecret = crypto.randomBytes(10).toString('hex')

app.disable('x-powered-by')

app.get('/favicon.ico', (req, res) => {
  res.sendStatus(404)
})

// Whenever nginx doesn't have a CAR file in cache, this is called
app.get('/cid/:cid*', async (req, res) => {
  const cid = req.params.cid + req.params[0]
  debug.extend('req')(`Cache miss for %s`, cid)
  res.set('Cache-Control', 'public, max-age=31536000, immutable')

  if (req.headers.range) {
    let [start, end] = req.headers.range.split('=')[1].split('-')
    start = parseInt(start, 10)
    end = parseInt(end, 10)

    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Range', `bytes ${start}-${end}/${testCAR.length}`)
    res.status(206)
    return res.end(testCAR.slice(start, end + 1))
  }

  // Testing CID
  if (cid === 'QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF') {
    return streamCAR(fs.createReadStream('./QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF.car'), res)
  }

  https.get(`https://ipfs.io/api/v0/dag/export?arg=${cid}`, async fetchRes => {
    streamCAR(fetchRes, res).catch(debug)
  })
})

app.get('/register-check', (req, res) => {
  const secret = req.query.secret
  debug('Register check with secret %s', secret)
  if (secret !== nodeSecret) {
    return res.sendStatus(403)
  }
  res.sendStatus(200)
})

app.listen(PORT, async () => {
  // debug(`==== IMPORTANT ====`)
  // debug(`==== Earnings will be sent to Filecoin wallet address: %s`, FIL_WALLET_ADDRESS)
  // debug(`==== IMPORTANT ====`)
  debug(`shim running on http://localhost:${PORT}. Test at http://localhost:${PORT}/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF?rcid=dev-${nodeID}`)

  await register()
  setInterval(() => {
    register().catch(() => process.exit(0))
  }, 5 * 60 * 1000) // register every 5 minutes

  // Start log ingestor
  import('./log_ingestor.js')
})

async function register() {
  // If cert is not yet in the volume, register
  if (!(await fsPromises.stat('/etc/nginx/ssl/gateway.crt').catch(_ => false))) {
    debug('Registering with orchestrator')
    try {
      const { cert, key } = await fetch(`http://${ORCHESTRATOR_URL}/register`, {
        method: 'post',
        body: JSON.stringify({ id: nodeID, secret: nodeSecret }),
        headers: { 'Content-Type': 'application/json' }
      }).then(res => res.json())

      await Promise.all([
        fsPromises.writeFile('/etc/nginx/ssl/gateway.crt', cert),
        fsPromises.writeFile('/etc/nginx/ssl/gateway.key', key)
      ])

      debug('Successful registration, restarting container...')

      process.exit(1)
    } catch (e) {
      debug('Failed registration %o', e)
      process.exit(0)
    }
  } else {
    debug(`nginx caching proxy running on https://localhost:${NGINX_PORT}. Test at https://localhost:${NGINX_PORT}/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF?rcid=dev-${nodeID}`)
    await fetch(`http://${ORCHESTRATOR_URL}/register?ssl=done`, {
      method: 'post',
      body: JSON.stringify({ id: nodeID, secret: nodeSecret }),
      headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json())

    debug('Successful registration')
  }
}