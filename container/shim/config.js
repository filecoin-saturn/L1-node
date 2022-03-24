export const PORT = process.env.SHIM_PORT || 10361
export const NGINX_PORT = process.env.NGINX_PORT || 10443
export const CACHE_STATION = process.env.CACHE_STATION || 'host.docker.internal:59501'
export const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'host.docker.internal:10363'
export const FIL_WALLET_ADDRESS = process.env.FIL_WALLET_ADDRESS || error('FIL_WALLET_ADDRESS')

function error (requiredVarName) {
  throw new Error(`${requiredVarName} missing in process env`)
}
