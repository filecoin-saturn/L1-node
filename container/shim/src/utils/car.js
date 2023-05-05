import { Readable, pipeline } from "node:stream";
import { promisify } from "node:util";
import { CarBlockIterator, CarWriter } from "@ipld/car";
import { bytes } from "multiformats";
import * as dagCbor from "@ipld/dag-cbor";
import * as dagPb from "@ipld/dag-pb";
import * as dagJson from "@ipld/dag-json";
import * as raw from "multiformats/codecs/raw";
import * as json from "multiformats/codecs/json";
import { sha256 } from "multiformats/hashes/sha2";
import { from as hasher } from "multiformats/hashes/hasher";
import { blake2b256 } from "@multiformats/blake2/blake2b";
import { MemoryBlockstore } from "blockstore-core/memory";
import { exporter } from "ipfs-unixfs-exporter";
import write from "stream-write";

const { toHex } = bytes;

const codecs = {
  [dagCbor.code]: dagCbor,
  [dagPb.code]: dagPb,
  [dagJson.code]: dagJson,
  [raw.code]: raw,
  [json.code]: json,
};

const hashes = {
  [sha256.code]: sha256,
  [blake2b256.code]: hasher(blake2b256),
};

/**
 * @param {IncomingMessage || ReadableStream} streamIn
 * @param {Response} streamOut
 */
export async function streamCAR(streamIn, streamOut) {
  const carBlockIterator = await CarBlockIterator.fromIterable(streamIn);
  const { writer, out } = await CarWriter.create(await carBlockIterator.getRoots());

  await Promise.all([
    promisify(pipeline)(Readable.from(out), streamOut),
    (async () => {
      for await (const { cid, bytes } of carBlockIterator) {
        await validateCarBlock(cid, bytes);
        await writer.put({ cid, bytes });
      }
      await writer.close();
    })(),
  ]);
}

/**
 * @param {IncomingMessage || ReadableStream} streamIn
 * @param {Response} streamOut
 */
export async function streamRawFromCAR(streamIn, streamOut) {
  const carBlockIterator = await CarBlockIterator.fromIterable(streamIn);

  for await (const { cid, bytes } of carBlockIterator) {
    await validateCarBlock(cid, bytes);
    await write(streamOut, bytes);
  }
  streamOut.end();
}

/**
 * @param {CID} cid
 * @param {Buffer} bytes
 * @returns boolean
 */
export async function validateCarBlock(cid, bytes) {
  if (!codecs[cid.code]) {
    throw new Error(`Unexpected codec: 0x${cid.code.toString(16)}`);
  }
  if (!hashes[cid.multihash.code]) {
    throw new Error(`Unexpected multihash code: 0x${cid.multihash.code.toString(16)}`);
  }

  // Verify step 2: if we hash the bytes, do we get the same digest as reported by the CID?
  // Note that this step is sufficient if you just want to safely verify the CAR's reported CIDs
  const hash = await hashes[cid.multihash.code].digest(bytes);
  if (toHex(hash.digest) !== toHex(cid.multihash.digest)) {
    throw new Error(
      `Mismatch: digest of bytes (${toHex(hash)}) does not match digest in CID (${toHex(cid.multihash.digest)})`
    );
  }
}

export async function extractPathFromCar(streamIn, path, res) {
  const carBlockIterator = await CarBlockIterator.fromIterable(streamIn);
  const blockstore = new MemoryBlockstore();

  for await (const { cid, bytes } of carBlockIterator) {
    await blockstore.put(cid, bytes);
  }

  const file = await exporter(path, blockstore);

  for await (const chunk of file.content()) {
    res.write(chunk);
  }

  res.end();
}
