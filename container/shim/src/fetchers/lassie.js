import http from "node:http";
import https from "node:https";

import { CarBlockIterator } from "@ipld/car";
import LRU from "lru-cache";
import { base64 } from "multiformats/bases/base64";
import write from "stream-write";

import { LASSIE_ORIGIN } from "../config.js";
import { streamCAR, validateCarBlock } from "../utils/car.js";
import { proxyResponseHeaders, toUtf8 } from "../utils/http.js";
import { debug as Debug } from "../utils/logging.js";

const debug = Debug.extend("lassie");
const LASSIE_TIMEOUT = 120_000;

const agentOpts = {
  keepAlive: true,
};
const httpsAgent = new https.Agent(agentOpts);
const httpAgent = new http.Agent(agentOpts);

const blockCache = new LRU({
  maxSize: 1024 ** 3, // 1 GB
  sizeCalculation: (block) => Buffer.byteLength(block),
  allowStale: true,
});

const cidToCacheKey = (cidObj) => base64.baseEncode(cidObj.multihash.bytes);

export function respondFromLassie(req, res, { cidObj, format }) {
  debug(`Fetch ${req.path} from Lassie`);

  const cacheKey = cidToCacheKey(cidObj);
  const cidV1 = cidObj.toV1();
  const cid = cidV1.toString();
  const isRawFormat = format === "raw";
  const isInBlockCache = isRawFormat && !req.params.path && blockCache.has(cacheKey);

  if (isInBlockCache) {
    const block = blockCache.get(cacheKey);
    return respondFromBlockCache(res, cid, block);
  }

  const lassieUrl = new URL(LASSIE_ORIGIN + toUtf8(req.path));
  for (const [key, val] of Object.entries(req.query)) {
    lassieUrl.searchParams.set(key, toUtf8(val));
  }
  lassieUrl.searchParams.set("format", "car");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LASSIE_TIMEOUT);

  const _http = lassieUrl.protocol === "https:" ? https : http;
  const agent = lassieUrl.protocol === "https:" ? httpsAgent : httpAgent;

  const lassieReq = _http
    .get(
      lassieUrl,
      {
        agent,
        timeout: LASSIE_TIMEOUT,
        signal: controller.signal,
      },
      (fetchRes) => {
        clearTimeout(timeout);
        const { statusCode } = fetchRes;

        res.status(statusCode);

        if (statusCode === 200) {
          res.set("Cache-Control", "public, max-age=29030400, immutable");
        } else if (statusCode >= 400) {
          debug.extend("error")(`Invalid response from Lassie (${statusCode}) for ${cid}`);
          res.end();
          return;
        }

        if (isRawFormat) {
          getRequestedBlockFromCar(fetchRes, res, cidV1, req.params.path).catch((err) => debug(err));
        } else {
          proxyResponseHeaders(fetchRes, res);
          streamCAR(fetchRes, res).catch(() => {});
        }
      }
    )
    .on("error", (err) => {
      clearTimeout(timeout);
      debug.extend("error")(`Error fetching from Lassie for ${cid}: ${err.name} ${err.message}`);
      if (controller.signal.aborted) {
        return res.sendStatus(504);
      }
      if (!res.headersSent) res.sendStatus(502);
    })
    .on("timeout", () => {
      clearTimeout(timeout);
      debug.extend("error")(`Timeout from Lassie for ${cid}`);
      lassieReq.destroy();
      res.destroy();
    });

  req.on("close", () => {
    clearTimeout(timeout);
    if (!res.writableEnded) {
      debug.extend("error")("Client aborted early, terminating lassie request");
      lassieReq.destroy();
    }
  });
}

/**
 * @param {Response} res
 * @param {string} cid
 * @param {Uint8Array} block
 */
function respondFromBlockCache(res, cid, block) {
  res.status(200);
  res.set("content-length", Buffer.byteLength(block));
  res.set("content-type", "application/vnd.ipld.raw");
  // TODO: Write headers
  res.end(block);
}

/**
 * The first block is returned to the client.
 * All other blocks (if any) are written to the block cache.
 *
 * @param {IncomingMessage || ReadableStream} streamIn
 * @param {Response} streamOut
 * @param {CID} requestedCidV1
 * @param {string} path
 */
async function getRequestedBlockFromCar(streamIn, streamOut, requestedCidV1, path) {
  const carBlockIterator = await CarBlockIterator.fromIterable(streamIn);
  const roots = await carBlockIterator.getRoots();
  const rootCid = roots[0];

  if (roots.length > 1) {
    throw new Error(`CAR file has more than one root CID.`);
  } else if (!path && !rootCid.toV1().equals(requestedCidV1)) {
    throw new Error(`Requested CID ${requestedCidV1} doesn't equal CAR root CID ${rootCid}.`);
  }

  let count = 0;

  for await (const { cid, bytes } of carBlockIterator) {
    if (!validateCarBlock(cid, bytes)) {
      streamOut.status(502);
      break;
    }

    const cidV1 = cid.toV1();
    if (count === 0) {
      if (!path && !cidV1.equals(requestedCidV1)) {
        throw new Error(`Requested CID ${requestedCidV1} doesn't equal first block CID ${rootCid}.`);
      }

      await write(streamOut, bytes);
      streamOut.end();
    } else {
      const cacheKey = cidToCacheKey(cidV1);
      blockCache.set(cacheKey, bytes);
    }
    count++;
  }
}
