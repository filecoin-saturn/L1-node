import { X509Certificate } from 'node:crypto'
import http from 'http'
import https from 'node:https'
import fsPromises from 'node:fs/promises'
import fetch from 'node-fetch'

import {
  DEV_VERSION,
  FIL_WALLET_ADDRESS,
  NODE_OPERATOR_EMAIL,
  NODE_UA,
  NODE_VERSION,
  nodeId,
  ORCHESTRATOR_URL,
  SATURN_NETWORK,
  updateNodeToken
} from '../config.js'
import { debug as Debug } from '../utils/logging.js'
import { getCPUStats, getDiskStats, getMemoryStats, getNICStats, getSpeedtest } from '../utils/system.js'
import { CERT_PATH, certExists, deleteCertAndKey, saveCertAndKey, SSL_PATH } from './tls.js'

const debug = Debug.extend('registration')

const agentOpts = {
  keepAlive: true
}
const agent = ORCHESTRATOR_URL.includes('https') ? new https.Agent(agentOpts) : new http.Agent(agentOpts)

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000
// Upload speed should be great than 100 Mbps
const MAIN_NET_MINIMUM_UPLOAD_BW_BYTES = 100 * 1000 * 1000 / 8

export async function register (initial) {
  const body = {
    nodeId,
    level: 1,
    version: NODE_VERSION,
    filWalletAddress: FIL_WALLET_ADDRESS,
    operatorEmail: NODE_OPERATOR_EMAIL,
    memoryStats: await getMemoryStats(),
    diskStats: await getDiskStats(),
    cpuStats: await getCPUStats(),
    nicStats: await getNICStats()
  }

  if (NODE_VERSION !== DEV_VERSION && (initial || Math.random() < 0.005)) {
    let speedtest
    try {
      speedtest = await getSpeedtest()
    } catch (err) {
      debug(`Error while performing speedtest: ${err.name} ${err.message}`)
    }
    if (speedtest?.upload.bandwidth < MAIN_NET_MINIMUM_UPLOAD_BW_BYTES) {
      if (SATURN_NETWORK === 'main') {
        throw new Error(`Node's upload speed is not enough, ${SATURN_NETWORK} network requirement is 1 Gbps`)
      } else {
        debug('WARNING: This node\'s upload speed is not enough for main network')
      }
    }
    Object.assign(body, { speedtest })
  }

  const registerOptions = postOptions(body)

  // If cert is not yet in the volume, register
  if (!certExists) {
    if (!await fsPromises.stat(SSL_PATH).catch(_ => false)) {
      debug('Creating SSL folder')
      await fsPromises.mkdir(SSL_PATH, { recursive: true })
    }

    debug('Registering with orchestrator for the first time, requesting new TLS cert with the following config (this could take up to 20 mins)')
    debug(body)
    try {
      const response = await fetch(`${ORCHESTRATOR_URL}/register`, registerOptions)
      const body = await response.json()
      const { cert, key } = body

      if (!response.ok || !cert || !key) {
        debug('Received status %d with body: %o', response.status, body)
        throw new Error(body?.error || 'Empty cert or key received')
      }

      debug('TLS certificate and key received, persisting to shared volume...')

      await saveCertAndKey(cert, key)

      debug('Success, restarting container...')

      process.exit()
    } catch (err) {
      debug(`Failed registration: ${err.name} ${err.message}`)
      process.exit(1)
    }
  } else {
    if (initial) {
      const certBuffer = await fsPromises.readFile(CERT_PATH)

      const cert = new X509Certificate(certBuffer)

      const validTo = Date.parse(cert.validTo)

      if (Date.now() > (validTo - TWO_DAYS_MS)) {
        debug('Certificate is soon to expire, deleting and restarting...')
        await deleteCertAndKey()
        process.exit()
      } else {
        debug(`Certificate is valid until ${cert.validTo}`)
      }
    }

    debug('Re-registering with orchestrator...')

    try {
      const { token, ipGeo, error, success } = await fetch(`${ORCHESTRATOR_URL}/register?ssl=done`, registerOptions).then(res => res.json())

      if (!success) {
        debug(error)
        throw new Error(error)
      }

      if (ipGeo) {
        debug(`Node's geolocation is set to ${ipGeo.city}, ${ipGeo.region}, ${ipGeo.country}. ` +
            'If this is wrong, please open an issue at https://github.com/filecoin-saturn/L1-node/issues')
      }

      updateNodeToken(token)

      debug('Successful re-registration, updated token')
    } catch (err) {
      debug('Failed re-registration %s', err.message)
      if (initial) {
        process.exit(1)
      }
    }
  }
  setTimeout(register, (SATURN_NETWORK === 'local' ? 1 : Math.random() * 4 + 1) * 60 * 1000)
}

let deregistering
export async function deregister () {
  if (!deregistering) deregistering = _deregister()
  return deregistering
}

async function _deregister () {
  debug('De-registering from orchestrator')
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, 10_000)

  try {
    await fetch(`${ORCHESTRATOR_URL}/deregister`, { ...postOptions({ nodeId }), signal: controller.signal })
    debug('De-registered successfully')
  } catch (err) {
    debug(`Failed to de-register: ${err.name} ${err.message}`)
  } finally {
    clearTimeout(timeout)
  }
}

export const addRegisterCheckRoute = (app) => app.get('/register-check', (req, res) => {
  const ip = req.ip.replace('::ffff:', '')
  const { nodeId: receivedNodeId } = req.query
  if (receivedNodeId !== nodeId) {
    debug.extend('check')(`Check failed, nodeId mismatch. Received: ${receivedNodeId} from IP ${ip}`)
    return res.sendStatus(403)
  }
  debug.extend('check')('Successful')
  res.sendStatus(200)
})

function postOptions (body) {
  return {
    agent,
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': NODE_UA
    }
  }
}
