import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'fs/promises'

const nodeIdFilePath = './shared/nodeId.txt'

export const NODE_VERSION = pVersion(process.env.NODE_VERSION || '0_dev')
export const PORT = process.env.SHIM_PORT || 10361
export const NGINX_PORT = process.env.NGINX_PORT || 8443
export const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL
export const FIL_WALLET_ADDRESS = process.env.FIL_WALLET_ADDRESS || error('FIL_WALLET_ADDRESS')
export const NODE_OPERATOR_EMAIL = process.env.NODE_OPERATOR_EMAIL || null
export const nodeId = await readFile(nodeIdFilePath, 'utf-8').catch(() => false) || createNodeId()
export let nodeToken = ''
export const updateNodeToken = (newToken) => { nodeToken = newToken }

function error (requiredVarName) {
  throw new Error(`${requiredVarName} missing in process env`)
}

function pVersion (version) {
  return version.slice(0, version.indexOf('_') + 8)
}

function createNodeId () {
  const newNodeId = randomUUID()
  writeFile(nodeIdFilePath, newNodeId).catch(console.error)
  return newNodeId
}
