import http from 'node:http'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import fsPromises from 'node:fs/promises'
import express from 'express'
import Debug from 'debug'
import { CarBlockIterator, CarWriter } from '@ipld/car'
import { bytes } from 'multiformats'
import * as dagCbor from '@ipld/dag-cbor'
import * as dagPb from '@ipld/dag-pb'
import * as dagJson from '@ipld/dag-json'
import * as raw from 'multiformats/codecs/raw'
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'
import { from as hasher } from 'multiformats/hashes/hasher'
import { blake2b256 } from '@multiformats/blake2/blake2b'

const { toHex } = bytes

const codecs = {
    [dagCbor.code]: dagCbor,
    [dagPb.code]: dagPb,
    [dagJson.code]: dagJson,
    [raw.code]: raw,
    [json.code]: json
}

const hashes = {
    [sha256.code]: sha256,
    [blake2b256.code]: hasher(blake2b256)
}

const PORT = process.env.SHIM_PORT || 3001
const NGINX_PORT = process.env.NGINX_PORT || false
const CACHE_STATION = process.env.CACHE_STATION || 'host.docker.internal:59501'
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'host.docker.internal:12345'

const debug = Debug('server')
const app = express()

const testCAR = await fsPromises.readFile('./QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF.car')

app.disable('x-powered-by')

app.get('/favicon.ico', (req, res) => {
    res.sendStatus(404)
})

// Whenever nginx doesn't have a CAR file in cache, this is called
app.get('/cid/:cid*', async (req, res) => {
    const cid = req.params.cid + req.params[0]
    debug.extend('req')(`Req for ${cid}, %o`, req.headers)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')

    if (req.headers.range) {
        let [start,end] = req.headers.range.split('=')[1].split('-')
        start = parseInt(start, 10)
        end = parseInt(end, 10)

        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Range', `bytes ${start}-${end}/${testCAR.length}`)
        res.status(206)
        return res.end(testCAR.slice(start, end + 1))
    }

    // Testing CID
    if (cid === 'QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF') {
        return streamCAR(fs.createReadStream('./QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF.car'), res)
    }

    http.get(`http://${CACHE_STATION}/car/${cid}`, async fetchRes => {
        streamCAR(fetchRes, res).catch(debug)
    })
})

/**
 * @param {AsyncIterable<Uint8Array> || IncomingMessage} streamIn
 * @param {Response} streamOut
 */
async function streamCAR (streamIn, streamOut) {
    const carBlockIterator = await CarBlockIterator.fromIterable(streamIn)
    const { writer, out } = await CarWriter.create(await carBlockIterator.getRoots())

    Readable.from(out).pipe(streamOut)

    for await (const { cid, bytes } of carBlockIterator) {
        if (!codecs[cid.code]) {
            debug(`Unexpected codec: 0x${cid.code.toString(16)}`)
            streamOut.status(502)
            break
        }
        if (!hashes[cid.multihash.code]) {
            debug(`Unexpected multihash code: 0x${cid.multihash.code.toString(16)}`)
            streamOut.status(502)
            break
        }

        // Verify step 2: if we hash the bytes, do we get the same digest as reported by the CID?
        // Note that this step is sufficient if you just want to safely verify the CAR's reported CIDs
        const hash = await hashes[cid.multihash.code].digest(bytes)
        if (toHex(hash.digest) !== toHex(cid.multihash.digest)) {
            debug(`\nMismatch: digest of bytes (${toHex(hash)}) does not match digest in CID (${toHex(cid.multihash.digest)})`)
            streamOut.status(502)
            break
        }

        await writer.put({ cid, bytes })
    }
    await writer.close()
}

app.listen(PORT, () => {
    debug(`shim running on http://localhost:${PORT}. Test at http://localhost:${PORT}/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF`)
    if (NGINX_PORT) {
        debug(`nginx caching proxy running on https://localhost:${NGINX_PORT}. Test at https://localhost:${NGINX_PORT}/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF`)
    }

    import('./log_ingestor.js')

    debug('Signing up with orchestrator')
    // http.request(`http://${ORCHESTRATOR_URL}`, { method: 'POST' }, fetchRes => {
    //     fetchRes.on('data', chunk => {
    //         res.write(chunk)
    //     });
    //
    //     fetchRes.on('end', () => {
    //         res.end()
    //     });
    // })
})