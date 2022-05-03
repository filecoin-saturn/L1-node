import fsPromises from 'node:fs/promises'
import fetch from 'node-fetch'
import Debug from 'debug'

import { NODE_OPERATOR_EMAIL, NODE_VERSION, nodeId, ORCHESTRATOR_URL, updateNodeToken } from './config.js'

const debug = Debug('node')

export async function register () {
  const registerBody = JSON.stringify({ nodeId, version: NODE_VERSION, operatorEmail: NODE_OPERATOR_EMAIL })
  const registerOptions = {
    method: 'post',
    body: registerBody,
    headers: { 'Content-Type': 'application/json' }
  }
  // If cert is not yet in the volume, register
  if (!(await fsPromises.stat('/usr/src/app/shared/ssl/node.crt').catch(_ => false))) {
    debug('Registering with orchestrator, requesting new TLS cert... (this could take up to 20 mins)')
    try {
      const response = await fetch(`http://${ORCHESTRATOR_URL}/register`, registerOptions)
      const body = await response.json()
      const { cert, key } = body

      if (!cert || !key) {
        debug('Received status %d with %o', response.status, body)
        throw new Error(body?.error || 'Empty cert or key received')
      }

      debug('TLS cert and key received, persisting to shared volume...')

      await Promise.all([
        fsPromises.writeFile('/usr/src/app/shared/ssl/node.crt', cert),
        fsPromises.writeFile('/usr/src/app/shared/ssl/node.key', key)
      ])

      debug('Successful registration, restarting container...')

      process.exit(1)
    } catch (e) {
      debug('Failed registration %o', e)
      process.exit(0)
    }
  } else {
    debug('Re-registering with orchestrator...')

    try {
      const { token } = await fetch(`http://${ORCHESTRATOR_URL}/register?ssl=done`, registerOptions).then(res => res.json())

      updateNodeToken(token)

      debug('Successful re-registration, updated token')
    } catch (e) {
      debug('Failed re-registration %s', e.message)
    }
  }
}