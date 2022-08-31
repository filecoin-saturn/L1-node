import test from 'test'
import assert from 'node:assert'
import app from '../src/index.js'
import fetch from 'node-fetch'
import http from 'node:http'
import { promisify } from 'node:util'
import { TESTING_CID } from '../src/config.js'
import fsPromises from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

async function createServer () {
  const server = http.createServer(app)
  await promisify(server.listen.bind(server))()
  return { server, address: `http://localhost:${server.address().port}` }
}

test('L1 node', async t => {
  const { server, address } = await createServer()

  await t.test('GET /favicon.ico', async t => {
    const res = await fetch(`${address}/favicon.ico`)
    assert.strictEqual(res.status, 404)
  })

  await t.test('GET /ipfs/:cid', async t => {
    await t.test('test CID', async t => {
      const res = await fetch(`${address}/ipfs/${TESTING_CID}`)
      assert.strictEqual(res.status, 200)
      assert.deepStrictEqual(
        Buffer.from(await (await res.blob()).arrayBuffer()),
        await fsPromises.readFile(join(
          dirname(fileURLToPath(import.meta.url)),
          '..',
          'public',
          `${TESTING_CID}.car`
        ))
      )
    })
  })

  server.close()
})
