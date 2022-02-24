import express from 'express'
import Debug from 'debug'
import * as IPFS from 'ipfs-core'

const debug = Debug('server')

const ipfs = await IPFS.create()

const app = express()
const port = process.env.PORT || 3001

app.disable('x-powered-by')

app.get('/favicon.ico', (req, res) => {
    res.sendStatus(404)
})

app.get('/cid/:cid*', async (req, res) => {
    const cid = req.params.cid + req.params[0]
    const cidPath = `./${cid}`
    debug(`Req for ${cid}`)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    const result = ipfs.cat(cid)
    for await (const buf of result) {
        res.write(buf)
    }
    res.end()
})

app.listen(port, () => {
    debug(`Gateway app listening on port ${port}`)
})