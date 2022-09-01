import test from 'test'
import assert from 'node:assert'
import app from '../src/index.js'
import fetch, { Headers } from 'node-fetch'
import http from 'node:http'
import { promisify } from 'node:util'
import {
  DEV_VERSION,
  IPFS_GATEWAY_ORIGIN,
  nodeId,
  TESTING_CID
} from '../src/config.js'
import fsPromises from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import nock from 'nock'

const testCAR = await fsPromises.readFile(join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  `${TESTING_CID}.car`
))

nock.disableNetConnect()
nock.enableNetConnect('localhost')

nock(IPFS_GATEWAY_ORIGIN)
  .get('/ipfs/CID')
  .reply(200, testCAR)

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
        testCAR
      )
    })
    await t.test('response headers', async t => {
      const res = await fetch(`${address}/ipfs/${TESTING_CID}`)
      assert.strictEqual(res.headers.get('content-type'), 'application/octet-stream')
      assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
      assert.strictEqual(res.headers.get('saturn-node-id'), nodeId)
      assert.strictEqual(res.headers.get('saturn-node-version'), DEV_VERSION)
    })
    await t.test('range request', async t => {
      const res = await fetch(`${address}/ipfs/${TESTING_CID}`, {
        headers: new Headers({
          range: 'bytes=10-20'
        })
      })
      assert.strictEqual(res.status, 206)
      assert.strictEqual(res.headers.get('accept-ranges'), 'bytes')
      assert.strictEqual(res.headers.get('content-range'), 'bytes 10-20/124')
      assert.deepStrictEqual(
        Buffer.from(await (await res.blob()).arrayBuffer()),
        testCAR.subarray(10, 21)
      )
    })
    await t.todo('respond from L2')
    await t.test('respond from ipfs gateway', async t => {
      await t.test('simple response', async t => {
        const res = await fetch(`${address}/ipfs/CID`)
        assert.strictEqual(res.status, 200)
        assert.deepStrictEqual(
          Buffer.from(await (await res.blob()).arrayBuffer()),
          testCAR
        )
      })
      await t.todo('formats')
      await t.todo('?filename')
      await t.todo('?download')
      await t.todo('timeout')
      await t.todo('user-agent')
      await t.todo('bad gateway response')
      await t.todo('proxy response headers')
      await t.todo('premature request end')
    })
  })
  await t.todo('GET /ipfs/:cid/:path*')
  await t.todo('GET /register/:l2NodeId')
  await t.todo('POST /data/:cid')

  server.close()
})
