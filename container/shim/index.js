import http from 'node:http'
import express from 'express'
import Debug from 'debug'
import * as IPFS from 'ipfs-core'

const PORT = process.env.SHIM_PORT || 3001
const NGINX_PORT = process.env.NGINX_PORT || 8443
const CACHE_STATION = process.env.CACHE_STATION || 'host.docker.internal'

const debug = Debug('server')
const ipfs = await IPFS.create()
const app = express()

app.disable('x-powered-by')

app.get('/favicon.ico', (req, res) => {
    res.sendStatus(404)
})

app.get('/cid/:cid*', async (req, res) => {
    const cid = req.params.cid + req.params[0]
    debug(`Req for ${cid}`)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')

    // Testing CID
    if (cid === 'QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF') {
        const result = ipfs.get(cid)
        for await (const buf of result) {
            res.write(buf)
        }
        return res.end()
    }

    http.get(`http://${CACHE_STATION}:59501/car/${cid}`, fetchRes => {
        fetchRes.on('data', chunk => {
            res.write(chunk)
        });

        fetchRes.on('end', () => {
            res.end()
        });
    })
})

app.listen(PORT, () => {
    debug(`shim running on http://localhost:${PORT}. Test at http://localhost:${PORT}/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF`)
    debug(`nginx caching proxy running on https://localhost:${NGINX_PORT}. Test at https://localhost:${NGINX_PORT}/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF`)
})