import { Route53Client } from '@aws-sdk/client-route-53'
import express from 'express'
import fetch from 'node-fetch'

const access_key_id = process.env.ACCESS_KEY_ID
const secret_access_key = process.env.SECRET_ACCESS_KEY

const client = new Route53Client({ region: "us-east-1", credentials: { accessKeyId: access_key_id, secretAccessKey: secret_access_key } })

const app = express()

app.use(express.json())

app.disable('x-powered-by')

app.post('/register', async (req, res) => {
  try {
    const ip = req.ip.replace('::ffff:', '')
    const { id, secret } = req.body
    console.log(`${id} at ${ip} with secret ${secret}`)
    await fetch(`http://${ip}:3001/register-check?secret=${secret}`)
    res.send({ success: true })
  } catch (e) {
    console.error(e)
    res.sendStatus(400)
  }
})

app.listen(6443, () => console.log('listening'))

// const command = new ListResourceRecordSetsCommand({ HostedZoneId: 'Z09029712OH8948J1FFCU' })
//
// const response = await client.send(command)
//
// console.dir(response)