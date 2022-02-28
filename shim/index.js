import express from 'express'
import Debug from 'debug'
import fetch from 'node-fetch'

const debug = Debug('server')

const app = express()
const PORT = process.env.PORT || 3001
const CACHE_STATION = process.env.CACHE_STATION || 'host.docker.internal'

app.disable('x-powered-by')

app.get('/favicon.ico', (req, res) => {
    res.sendStatus(404)
})

app.get('/cid/:cid*', (req, res) => {
    const cid = req.params.cid + req.params[0]
    debug(`Req for ${cid}`)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    fetch(`http://${CACHE_STATION}:59501/car/${cid}`).then(response => {
        console.log(response.body.pipe(res))
    })
})

app.listen(PORT, () => {
    debug(`Gateway app listening on port ${PORT}`)
})