import { promisify } from 'node:util'
import { exec as CpExec } from 'node:child_process'
import fsPromises from 'node:fs/promises'
const exec = promisify(CpExec)
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
    await fetch(`http://${ip}:10361/register-check?secret=${secret}`)

    // TODO: use state field for something
    const { stdout, stderr } = await exec(`openssl req -new -newkey rsa:2048 -nodes -keyout ${id}.key -out ${id}.csr -subj "/C=US/ST=../L=${id}/O=Protocol Labs/OU=Filecoin Saturn/CN=cdn.saturn-test.network"`)
    const key = (await fsPromises.readFile(`./${id}.key`)).toString()

    console.log(stdout)
    console.log(stderr)
    res.send({ success: true, cert: '', key: key })
  } catch (e) {
    console.error(e)
    res.status(400).send({ success: false, error: e.toString() })
  }
})

app.listen(process.env.ORCHESTRATOR_PORT || 10363, () => console.log('listening'))

// const command = new ListResourceRecordSetsCommand({ HostedZoneId: 'Z09029712OH8948J1FFCU' })
//
// const response = await client.send(command)
//
// console.dir(response)