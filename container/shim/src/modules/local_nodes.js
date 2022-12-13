import fetch from 'node-fetch'
import { ORCHESTRATOR_URL } from '../config.js'
import { orchestratorAgent } from '../utils/http.js'
import { debug as Debug } from '../utils/logging.js'

const debug = Debug.extend('local-nodes')

export let localNodes = []

export async function refreshLocalNodes () {
  debug('Refreshing local nodes')
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/requirements`, { agent: orchestratorAgent })
    localNodes = await res.json()
    debug(`Local nodes refreshed, ${localNodes.length} nodes found`)
  } catch (err) {
    debug(`Failed to refresh local nodes: ${err.message}`)
  }
  setTimeout(refreshLocalNodes, 5 * 60 * 1000)
}
