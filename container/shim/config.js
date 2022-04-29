import { randomUUID } from 'node:crypto'

export const NODE_VERSION = pVersion(process.env.NODE_VERSION || '0_dev')
export const PORT = process.env.SHIM_PORT || 10361
export const NGINX_PORT = process.env.NGINX_PORT || 8443
export const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL
export const FIL_WALLET_ADDRESS = process.env.FIL_WALLET_ADDRESS || error('FIL_WALLET_ADDRESS')
export const nodeId = randomUUID()
export let nodeToken = ''
export const updateNodeToken = (newToken) => { nodeToken = newToken }

function error (requiredVarName) {
  throw new Error(`${requiredVarName} missing in process env`)
}

function pVersion (version) {
  return version.slice(0, version.indexOf('_') + 8)
}
