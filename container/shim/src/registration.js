import { X509Certificate } from 'node:crypto'
import fsPromises from 'node:fs/promises'
import fetch from 'node-fetch'
import Debug from 'debug'

import { NODE_OPERATOR_EMAIL, NODE_VERSION, nodeId, ORCHESTRATOR_HOST, updateNodeToken } from './config.js'

const debug = Debug('node')

const CERT_PATH = '/usr/src/app/shared/ssl/node.crt'
const KEY_PATH = '/usr/src/app/shared/ssl/node.key'
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

export async function register (initial) {
  const registerBody = JSON.stringify({ nodeId, version: NODE_VERSION, operatorEmail: NODE_OPERATOR_EMAIL })
  const registerOptions = {
    method: 'post',
    body: registerBody,
    headers: { 'Content-Type': 'application/json' }
  }

  const certExists = await fsPromises.stat(CERT_PATH).catch(_ => false)

  // If cert is not yet in the volume, register
  if (!certExists) {
    debug('Registering with orchestrator, requesting new TLS cert... (this could take up to 20 mins)')
    try {
      const response = await fetch(`https://${ORCHESTRATOR_HOST}/register`, registerOptions)
      const body = await response.json()
      const { cert, key } = body

      if (!cert || !key) {
        debug('Received status %d with %o', response.status, body)
        throw new Error(body?.error || 'Empty cert or key received')
      }

      debug('TLS cert and key received, persisting to shared volume...')

      await Promise.all([
        fsPromises.writeFile(CERT_PATH, cert),
        fsPromises.writeFile(KEY_PATH, key)
      ])

      debug('Successful registration, restarting container...')

      process.exit()
    } catch (e) {
      debug('Failed registration %o', e)
      process.exit(1)
    }
  } else {
    if (initial) {
      const certBuffer = await fsPromises.readFile(CERT_PATH)

      const cert = new X509Certificate(certBuffer)

      const validTo = Date.parse(cert.validTo)

      if (Date.now() > (validTo - FIVE_DAYS_MS)) {
        debug('Certificate is soon to expire, deleting and rebooting...')
        await Promise.all([
          fsPromises.unlink(CERT_PATH).catch(debug),
          fsPromises.unlink(CERT_PATH).catch(debug)
        ])
        process.exit()
      }
    }

    debug('Re-registering with orchestrator...')

    try {
      const { token } = await fetch(`https://${ORCHESTRATOR_HOST}/register?ssl=done`, registerOptions).then(res => res.json())

      updateNodeToken(token)

      debug('Successful re-registration, updated token')
    } catch (e) {
      debug('Failed re-registration %s', e.message)
    }
  }
  setTimeout(register, (Math.random() * 2 + 4) * 60 * 1000)
}