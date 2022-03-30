import { promisify } from 'node:util'
import { exec as CpExec } from 'node:child_process'
import fsPromises from 'node:fs/promises'
import { ChangeResourceRecordSetsCommand, ListResourceRecordSetsCommand, Route53Client } from '@aws-sdk/client-route-53'
import express from 'express'
import fetch from 'node-fetch'
import { IPinfoWrapper } from 'node-ipinfo'
import { countryToContinent, superRegions, usStateList } from './geo.mjs'

const exec = promisify(CpExec)

const {
  NODE_ENV = 'development',
  ACCESS_KEY_ID,
  SECRET_ACCESS_KEY,
  ZEROSSL_ACCESS_KEY,
  ORCHESTRATOR_PORT,
  IPINFO_TOKEN
} = process.env
const cdn_url = 'cdn.saturn-test.network'
const defaultKey = `-----BEGIN RSA PRIVATE KEY-----
MIIJKQIBAAKCAgEArQskZEb/zip/BCQI3uox9r53AU6GFV5M+ZEYzFumBbq1Q3Rw
aucZZ1Y5AHLw+Jq+TU5snzUT3dWPbT4G3lrlSypkpkThwwIjzq7JVOieC9Z3kBlV
vXjirP0lGGQyMt/4zKfaQ5/wOhKxSVO9uWmJo07sIheEUm2lNVPUiEm3R7G73NeF
sQrvLujIPhUih1fecOKbgpbWeFvPk6wS/whhD0/ofjH4qnxlLJplu3b7BaQO0psR
upAwG0E64ulTWcg+ixp825kbp4pGeBjQm1e9B/UJi2OXdgVhZbCE6cqMvEylbsF7
iP3LXDp/bpo+2Qdo7Hk4hinNLTu5tDXTK/WiQ0S/gAczcz+B6ho4F54MeS0KGbYm
TI86GrMuNxN3JeMwphAvMGlwKRNdoN31bLBa4N+yIyxTdekMAfY+I8MSE5T4NZcK
dazZWMfQ0NrQ8HserIbVq/+WafWGuArNBUxseUH8Rlz4riv5trjxTY5Q56yo+JF0
ztVaVMeon40QhdzlSq2LZeBlZo8MhyB66exL+mmZ6QJbrSipxysoVBA3wnLi3pA+
JoAqHwp5cD/yDo29gCiUQD8/eu0mqFmro4DVQcEyOqIhxDSzBbOIPcRM+U8zVe9m
e7r0Fel7+d1mac/ogIMQp1C6Po1SoaY0R2VKXAWhbycaOJW0m3xf0SFEaa0CAwEA
AQKCAgA0f7vjvHKhbt0oOXKDhtPvwytBtzwQwZJi6PV4EpoVBOc3dt0gYcqgQlV6
4GRhWDlCJPfpeWX0mHUyNG5LCZKlMlBk7WL9EeohK4AjhYtllgSiMD2GBWXoC8k0
VDmym6bVGFusxppQVBl7YK+fz/gVFr2nPjFD/MXxnuRNEOhNFQwk3TJPWzzjo3YU
976JB0ySPP3nKbIZw+j/KWZ9/2HLDng/yRNjTeg4FwOkU12nAXYJyUggrNwbeLfP
3fAOviTTeQ7GZPYx506n4wdvCbhs8JebtXRfNxSskFhSwcPe4PYT2xmKn00SRyEg
QiWtHIVlsQVIFuiLv6IAnY/at2QpuqgLgsrXAy5jweSqOD6wfpxgErQLh2d1DZJG
FC63hhwilsxZMP00Y1w+8MSO3Nj3pYIbVsFCmwdCuQvlk+v9WLGS4X7TERm9w7bF
n3cJ/9KvbqkgPRjpHt92VGUAx5umtP73mqqdcSkROv1cM5UckCbGg3lJYjLSCh/r
Wg4kkxaos/KX8Zzenc2HwBwdAxLuHROKP4KIDB2SrhfWndvU5gqxNwL1Gq8gADo1
/eAGhEA/aYOAajHWLmGugCWCvQfZC2baEhMwBAohGQoHVhLmTLEBUsQZB3+c8hPI
Z1BzWYeUTII+ismfH9xtKxPMzO6Dd4i+/3e1kTDekcuZKPqTVQKCAQEA2hW0bTEt
dS5hB2ka51VqQqZtMoucp307osNI8F4VnfkUaV+2IDvBczl6jQGUnEIVGbSccg7g
9Zwq5ckdxXPX3NCPt7vle5Q+bVQT/uLp4G59673vUlINYKqSpiZkBE/ikCcltTbO
lVwBpvXMUAvXYO2K/pjWUneFXkEb4FPxkh6jJfNp0HzO/Agws0ji4cZ0rgxmVaJc
NwOYkPBoQHUDZUzx4UY1HU/7z//o1+o/IiqLdHV8DRQJ5PLaXfA8+huJnaeOsilQ
+HOF2nkOGnfKUARPrm+UU3qPoVyhMacJ0ZfyHnScuo9/FqXFt0cd3rSbIyuNgUZX
hkDMS+wphPIWBwKCAQEAyyDJcM2nWKuxjMIVqtHHJQnBt/4OTSGQNx3gPR8eZZcL
F60jq1kiGrtagzlmu1l2XYKiIMlPEqX76NTvvpYKht6CO4YTC5lmP2QDRWvwwbEN
5eduG9afWw4c0e6tlSbsaQOPpTE7C21hlf+VeJqUZKrSu1rOr5y6DWKNHNk7S353
FbvA756iH5Z6bjopw3ALP+cUcsz4OYLeH4KM3CdlU5teFIoqm9KLlA74Txc+Iaw4
uhu6jme+pEQRUs7ENofJr0dkWf7VywH6twPtpntsxyIstx2pSTWdR/IYp061Fi+5
8vcH1LNHaGpHy9dxcBZ2gNZI9OLJzw6p9UmawO31qwKCAQBqUnCfV31xBsZ5RW2/
YK4ohljwbo5WPcDoTkruHQBu/vNLmEUDm/5pPZmYyy93quP8n0gydzyHobZsRsvD
6wFPf0LB8dIkmJaC2J3TAy/Aoj2zw+q8eJJbEW3joQ3b6FJtsxg4K9s1iCCqFGWi
lNNRRx4fl8XNeMXFuPptOJ+qfFNP+kcZRO/ogdm0XpF2Pzm9bQArObe5foBQEVTS
L/oS1huKl57nhooe0wXi1ionbxSEF47+FUnpm9iIOcqQqQJDoV/5ThlSt4eHhsMw
djxlHGT4hx+KP1Ns+OsBeQ1ZaLm6zWFntvPfx7wH6Z0PaX/E+sPHRdL/+fFgBmgL
j7bbAoIBAQChNhNJyJ4RHKrcKMkjejxQI+8wBJz7EDEx3S8zszffrsGp98rAWgxc
JOeQEAV9mWH8kwnzdXGhPkSwpBbmLpSKN5wqe50v7n4cv1ZtSV6ZitiZ51QXGf39
OTUcVA5Fus+UBLSDiY/v4M67Sk4pmp09S+nVshspevyaVOXjyHBr2SHQCOP2CPNo
mHfwdY7hwlHbVJ2BAzXaBwgc//KlY0ri0QMY0BNC+hW22y6tLqgr91BKPGmSTbob
Cr6o9tr44EnsJ3/4gOzSom6Fw8NgBsLtRC0y44KQTNHX4Mc6OZg01IoCz5XSdLqu
nvL+T62DJQDF/cuHN1qtT1kKCHGevvzjAoIBAQCWwmIpNJ2PN8NebNdJ3g3WQlPV
GhpUjENyGPVPJMAZqW5KtNXUTiu+8hQvRKSoCvbwrDcndafVvY1pviDWckC2J/tT
Ll34c0XrwzsmUjnAFtkhH2iffwuQVxuauUY0tKqaZeFnz/l/h49ErdtQXckyPjOZ
My8+NYBqB3U62TolEKN2RZU1xEddF7DYPmBmD8Bgcs0IJ+J7rdyDG0uMWBeKhxnZ
RCyKTh1ZK84moGl7+89wNq+UfYHIg+FPwKjXZMQn+5AX03v0Uq8Q9bWxeAm2czRo
s8CqDBpaxphGPmWbfFqYNuPuBbsPgLrQRoKRggwlgZpFahE2lRcHzzSy1SVV
-----END RSA PRIVATE KEY-----`
const defaultCrt = `-----BEGIN CERTIFICATE-----
MIIFTDCCAzQCCQCmeJKOU5snlDANBgkqhkiG9w0BAQsFADBoMRYwFAYDVQQKDA1Q
cm90b2NvbCBMYWJzMRgwFgYDVQQLDA9GaWxlY29pbiBTYXR1cm4xEjAQBgNVBAMM
CWxvY2FsaG9zdDEgMB4GCSqGSIb3DQEJARYRZGllZ29AcHJvdG9jb2wuYWkwHhcN
MjIwMzAyMTI1NDI1WhcNMjMwMzAyMTI1NDI1WjBoMRYwFAYDVQQKDA1Qcm90b2Nv
bCBMYWJzMRgwFgYDVQQLDA9GaWxlY29pbiBTYXR1cm4xEjAQBgNVBAMMCWxvY2Fs
aG9zdDEgMB4GCSqGSIb3DQEJARYRZGllZ29AcHJvdG9jb2wuYWkwggIiMA0GCSqG
SIb3DQEBAQUAA4ICDwAwggIKAoICAQCtCyRkRv/OKn8EJAje6jH2vncBToYVXkz5
kRjMW6YFurVDdHBq5xlnVjkAcvD4mr5NTmyfNRPd1Y9tPgbeWuVLKmSmROHDAiPO
rslU6J4L1neQGVW9eOKs/SUYZDIy3/jMp9pDn/A6ErFJU725aYmjTuwiF4RSbaU1
U9SISbdHsbvc14WxCu8u6Mg+FSKHV95w4puCltZ4W8+TrBL/CGEPT+h+MfiqfGUs
mmW7dvsFpA7SmxG6kDAbQTri6VNZyD6LGnzbmRunikZ4GNCbV70H9QmLY5d2BWFl
sITpyoy8TKVuwXuI/ctcOn9umj7ZB2jseTiGKc0tO7m0NdMr9aJDRL+ABzNzP4Hq
GjgXngx5LQoZtiZMjzoasy43E3cl4zCmEC8waXApE12g3fVssFrg37IjLFN16QwB
9j4jwxITlPg1lwp1rNlYx9DQ2tDwex6shtWr/5Zp9Ya4Cs0FTGx5QfxGXPiuK/m2
uPFNjlDnrKj4kXTO1VpUx6ifjRCF3OVKrYtl4GVmjwyHIHrp7Ev6aZnpAlutKKnH
KyhUEDfCcuLekD4mgCofCnlwP/IOjb2AKJRAPz967SaoWaujgNVBwTI6oiHENLMF
s4g9xEz5TzNV72Z7uvQV6Xv53WZpz+iAgxCnULo+jVKhpjRHZUpcBaFvJxo4lbSb
fF/RIURprQIDAQABMA0GCSqGSIb3DQEBCwUAA4ICAQBg7do9ELIvCI8OGaDXeyhF
d2OmmXJgUb1JJwpSnvXAHXAvc0z3DophNN0imdMKTINdPHX/YuzCJbZ6yTGdNQdW
cKzvtohZTtRAD/72rIF6NOXXQXGMHEgtip5+lDi8juG1SVtIgB16eLzHYrl11a+N
gPbdVUIi7wvi8U0NFMmtz4T1Gpv6A1APCJOVZWsXim33rRm2AGu/utqqkomxG2jO
5RVWFKKjXs7Ub7jpR7+b6KQ18b4oKn5CQThxBtFSvj2oqxyPQSQUjjb90BMJpk33
IG9/4SiTmIx7Lhhbvp+eWV5vAhO4mc5WMMd+j4BNOT/ikUN8Na10pvuNdVgKDqqC
/hSDJVnzUnR2syxhTflWxs/GfDk0y0oyCIGENGUw6if+A00ucY64vgni5mxj4EwO
pafT+i0Bi/bOO+bulju0/+MrTxTAB1BRyRdNLEsfeqJHox5a5PWj+DBWatTk0znb
yRUDsHuuJZ3Rua8My2KL7woPcUbo58aVq6BOkwgPQ3VeG0q45axg9/UoXdzOPAZ6
XXZUn/W1t+wSI2ccrRr8C/ezB0V9Eq+aZO1lupz/IITsoae57SYhRsnZxo8jc88C
2ShMK0BpwAkHY0VZ10MZPgtihZM7n/GQt0Jsrck1/A1BeZX2ASBXvy8a8ukTnZv9
KUoOmK6y8JnCxWrbp8B0tw==
-----END CERTIFICATE-----`
const HostedZoneId = 'Z09029712OH8948J1FFCU'

const ipinfoClient = new IPinfoWrapper(IPINFO_TOKEN)

const route53Client = new Route53Client({
  region: 'us-east-1', credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY }
})

const app = express()

app.use(express.json())

app.disable('x-powered-by')

app.post('/register', async (req, res) => {
  const ip = req.ip.replace('::ffff:', '').replace('127.0.0.1', '45.58.126.78')
  const { id, secret } = req.body
  const { ssl } = req.query
  const ipGeo = await ipinfoClient.lookupIp(ip)
  console.log(`${id} at ${ip} from ${ipGeo.city}, ${ipGeo.region}, ${ipGeo.country} (${ipGeo.countryCode}) with secret ${secret}`)

  try {
    await fetch(`http://${ip}:10361/register-check?secret=${secret}`)

    const response = { success: true }

    if (NODE_ENV === 'production') {
      const geoLoc = { CountryCode: ipGeo.countryCode }
      let setId = ipGeo.countryCode

      if (ipGeo.countryCode === 'US') {
        geoLoc.SubdivisionCode = usStateList[ipGeo.region]
        setId += `-${usStateList[ipGeo.region]}`
      }

      const currentRecords = await route53Client.send(new ListResourceRecordSetsCommand({
        HostedZoneId, StartRecordName: cdn_url, StartRecordType: 'A', StartRecordIdentifier: setId, MaxItems: 1
      }))

      let currentRecord = currentRecords?.ResourceRecordSets?.[0]
      currentRecord = currentRecord.SetIdentifier === setId ? currentRecord : undefined

      const dnsChanges = [
        {
          Action: 'UPSERT', ResourceRecordSet: {
            Name: cdn_url,
            Type: 'A',
            GeoLocation: geoLoc,
            ResourceRecords: [...(currentRecord?.ResourceRecords || []), { Value: ip }],
            SetIdentifier: setId,
            TTL: 60
          }
        }
      ]

      if (ssl !== 'done') {
        let cert = defaultCrt
        let key = defaultKey

        console.log('New production registration, generating CSR')
        // TODO: use state field for something
        const {
          stdout, stderr
        } = await exec(`openssl req -new -newkey rsa:2048 -nodes -keyout ${id}.key -out ${id}.csr -subj "/C=US/ST=../L=${id}/O=Protocol Labs/OU=Filecoin Saturn/CN=cdn.saturn-test.network"`)

        console.log(stdout)
        console.error(stderr)

        key = (await fsPromises.readFile(`./${id}.key`)).toString()
        const csr = (await fsPromises.readFile(`./${id}.csr`)).toString()

        fsPromises.unlink(`./${id}.key`).catch(console.error)
        fsPromises.unlink(`./${id}.csr`).catch(console.error)

        console.log('Requesting new cert from ZeroSSL')

        const createCertFormData = new URLSearchParams()
        createCertFormData.append('certificate_domains', cdn_url)
        createCertFormData.append('certificate_csr', csr)
        const createCertResponse = await fetch(`https://api.zerossl.com/certificates?access_key=${ZEROSSL_ACCESS_KEY}`, {
          method: 'POST', body: createCertFormData
        }).then(res => res.json())
        console.dir(createCertResponse)
        const { id: certId, validation } = createCertResponse

        const cdnValidation = validation.other_methods[cdn_url]
        const subdomain = cdnValidation.cname_validation_p1
        const cname = cdnValidation.cname_validation_p2
        console.log(`Validation of ${cdn_url} is to point ${subdomain} to ${cname}, creating...`)

        await route53Client.send(new ChangeResourceRecordSetsCommand({
          HostedZoneId, ChangeBatch: {
            Changes: [
              {
                Action: 'UPSERT', ResourceRecordSet: {
                  Type: 'CNAME', Name: subdomain, ResourceRecords: [{ Value: cname }], TTL: 60
                }
              }
            ]
          }
        }))

        console.log('DNS record created, waiting for propagation...')

        await new Promise((resolve => setTimeout(resolve, 10_000)))

        console.log('Requesting validation from ZeroSSL')

        const validateFormData = new URLSearchParams()
        validateFormData.append('validation_method', 'CNAME_CSR_HASH')
        const validateCnameResponse = await fetch(`https://api.zerossl.com/certificates/${certId}/challenges?access_key=${ZEROSSL_ACCESS_KEY}`, {
          method: 'POST', body: validateFormData
        }).then(res => res.json())

        console.dir(validateCnameResponse)

        console.log('Requesting cert from ZeroSSL')

        await new Promise((resolve => setTimeout(resolve, 10_000)))

        const certResponse = await fetch(`https://api.zerossl.com/certificates/${certId}/download/return?access_key=${ZEROSSL_ACCESS_KEY}`).then(res => res.json())

        console.log(certResponse)

        cert = certResponse['certificate.crt']

        response.cert = cert
        response.key = key

        dnsChanges.push({
          Action: 'DELETE', ResourceRecordSet: {
            Type: 'CNAME', Name: subdomain, ResourceRecords: [{ Value: cname }], TTL: 60
          }
        })
      }

      await route53Client.send(new ChangeResourceRecordSetsCommand({
        HostedZoneId, ChangeBatch: {
          Changes: dnsChanges
        }
      }))
    }

    res.send(response)
  } catch (e) {
    console.error(e)
    res.status(400).send({ success: false, error: e.toString() })
  }
})

app.listen(ORCHESTRATOR_PORT || 10363, () => console.log('listening', NODE_ENV))

let lastActiveSuperRegions = superRegions.reduce((pv, cv) => Object.assign(pv, { [cv]: new Set() }), {})
const checkActive = async () => {
  console.log(`Checking active gateways for (${cdn_url})...`)

  const response = await route53Client.send(new ListResourceRecordSetsCommand({
    HostedZoneId, StartRecordName: cdn_url, StartRecordType: 'A'
  }))

  let activeSuperRegions = superRegions.reduce((pv, cv) => Object.assign(pv, { [cv]: new Set() }), {})

  for (const recordSet of response.ResourceRecordSets) {
      // Skip global, continents and US-wide records
      if (!recordSet.Name.startsWith(cdn_url)
        || recordSet.GeoLocation?.CountryCode === '*'
        || recordSet.GeoLocation.ContinentCode
        || (recordSet.GeoLocation?.CountryCode === 'US' && !recordSet.GeoLocation?.SubdivisionCode)) {
        continue
      }
      const gatewayIps = recordSet.ResourceRecords.map(rr => rr.Value)
      for (const gatewayIp of gatewayIps) {
        console.log(`Checking ${gatewayIp} of ${recordSet.SetIdentifier}...`)
        try {
          await fetch(`http://${gatewayIp}:10361/cid/QmQ2r6iMNpky5f1m4cnm3Yqw8VSvjuKpTcK1X7dBR1LkJF`)
          console.log(`${gatewayIp} of ${recordSet.SetIdentifier} is active`)

          activeSuperRegions.Global.add(gatewayIp)
          activeSuperRegions[countryToContinent[recordSet.GeoLocation?.CountryCode]].add(gatewayIp)
          if (recordSet.GeoLocation?.CountryCode === 'US') {
            activeSuperRegions.US.add(gatewayIp)
          }
        } catch (e) {
          console.error(`${gatewayIp} of ${recordSet.SetIdentifier} is down, removing...`)
          route53Client.send(new ChangeResourceRecordSetsCommand({
            HostedZoneId, ChangeBatch: {
              Changes: [
                {
                  Action: 'DELETE', ResourceRecordSet: recordSet
                }
              ]
            }
          })).catch(console.error)
        }
      }

  }

  for (const superRegion of superRegions) {
    const active = activeSuperRegions[superRegion]
    const lastActive = lastActiveSuperRegions[superRegion]
    if (active.size !== lastActive.size
      || ![...active].every(activeIp => lastActive.has(activeIp))) {

      const GeoLocation = {}
      if (superRegion === 'Global') {
        GeoLocation.CountryCode = '*'
      } else if (superRegion === 'US') {
        GeoLocation.CountryCode = superRegion
      } else {
        GeoLocation.ContinentCode = superRegion
      }

      console.log(`Updating ${superRegion} (${JSON.stringify(GeoLocation)}) record with`, [...active].join(', '))
      await route53Client.send(new ChangeResourceRecordSetsCommand({
        HostedZoneId, ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT', ResourceRecordSet: {
                SetIdentifier: superRegion,
                Type: 'A',
                Name: cdn_url,
                GeoLocation: { CountryCode: '*' },
                ResourceRecords: [...active].map(ip => ({ Value: ip })),
                TTL: 60
              }
            }
          ]
        }
      })).catch(console.error)
      lastActiveSuperRegions[superRegion] = active
    }
  }

  console.log('Updated DNS records\n')
}

checkActive()
setInterval(checkActive, 60_000)
