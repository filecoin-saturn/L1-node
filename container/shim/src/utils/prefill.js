import { setTimeout as setTimeoutPromise } from 'timers/promises'
import fetch from 'node-fetch'
import { Agent } from 'https'

import { ORCHESTRATOR_URL } from '../config.js'
import { debug as Debug } from './logging.js'

const debug = Debug.extend('cache-prefill')

export const prefillCache = () => {
  debug('Prefilling cache')
  getTopCids().then(async topCids => {
    for (const cid of topCids) {
      const controller = new AbortController()
      const signal = controller.signal
      await fetch(`https://localhost/ipfs/${cid}`, { signal, agent: new Agent({ rejectUnauthorized: false }) })
      controller.abort()
      await setTimeoutPromise(1000)
    }

    debug('Cache prefill complete')
  }).catch(err => {
    debug(`Failed to prefill cache: ${err.message}`)
  })
}

async function getTopCids () {
  return await fetch(`${ORCHESTRATOR_URL}/top-cids`)
}