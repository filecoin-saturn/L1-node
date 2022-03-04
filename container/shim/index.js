import http from 'node:http'
import fsPromises from 'node:fs/promises'
import express from 'express'
import Debug from 'debug'

import('./log_ingestor.js')

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
        return res.end(testCAR)
    }

    http.get(`http://${CACHE_STATION}/car/${cid}`, fetchRes => {
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
    if (NGINX_PORT) {
        debug(`nginx caching proxy running on https://localhost:${NGINX_PORT}. Test at https://localhost:${NGINX_PORT}/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF`)
    }

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