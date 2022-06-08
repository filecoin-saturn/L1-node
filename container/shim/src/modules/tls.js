import fsPromises from 'node:fs/promises'
import { debug as Debug } from '../utils/logging.js'

const debug = Debug.extend('tls')

export const SSL_PATH = '/usr/src/app/shared/ssl'
export const CERT_PATH = `${SSL_PATH}/node.crt`
export const KEY_PATH = `${SSL_PATH}/node.key`

export const certExists = await fsPromises.stat(CERT_PATH).catch(_ => false)

export async function saveCertAndKey (cert, key) {
  debug('Saving cert and key')
  return await Promise.all([
    fsPromises.writeFile(CERT_PATH, cert),
    fsPromises.writeFile(KEY_PATH, key)
  ])
}

export async function deleteCertAndKey () {
  debug('Deleting cert and key')
  return Promise.all([
    fsPromises.unlink(CERT_PATH).catch(debug),
    fsPromises.unlink(KEY_PATH).catch(debug)
  ])
}
