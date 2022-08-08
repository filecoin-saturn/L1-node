import { Readable } from 'node:stream'
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
import { MemoryBlockstore } from 'blockstore-core/memory'
import { exporter } from 'ipfs-unixfs-exporter'

import { debug as Debug } from './logging.js'
import {CARMimeTypeRetriever} from "./car_mimetype.js";

const debug = Debug.extend('utils')

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

const noCompressionFormats = [
  'video/mp4', 'audio/mp4', 'application/mp4', 'audio/mpeg'
]

/**
 * @param {IncomingMessage || ReadableStream} streamIn
 * @param {Response} streamOut
 */
export async function streamCAR (streamIn, streamOut) {
  const carBlockIterator = await CarBlockIterator.fromIterable(streamIn)
  const { writer, out } = await CarWriter.create(await carBlockIterator.getRoots())
  const root = (await carBlockIterator.getRoots())[0]

  const carMimeTypeRetriever = new CARMimeTypeRetriever()

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

    carMimeTypeRetriever.addBlock(cid, bytes)
    writer.put({ cid, bytes })
  }


  const result = await carMimeTypeRetriever.retrieveType(root)
  console.log(`Mime type(s): ${result}`)

  const shouldCompress = result.filter(type => !noCompressionFormats.includes(type)).length > 0
  if (shouldCompress) {
    streamOut.setHeader('Content-Type', 'application/vnd.ipld.car ; compress')
  }

  Readable.from(out).pipe(streamOut)

  await writer.close()
}

export async function extractPathFromCar (streamIn, path, res) {
  const carBlockIterator = await CarBlockIterator.fromIterable(streamIn)
  const blockstore = new MemoryBlockstore()

  for await (const { cid, bytes } of carBlockIterator) {
    await blockstore.put(cid, bytes)
  }

  const file = await exporter(path, blockstore)

  for await (const chunk of file.content()) {
    res.write(chunk)
  }

  res.end()
}
