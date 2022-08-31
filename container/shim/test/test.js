import test from 'test'
import assert from 'node:assert'
import app from '../src/index.js'
import fetch from 'node-fetch'
import http from 'node:http'
import { promisify } from 'node:util'

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

  server.close()
})
