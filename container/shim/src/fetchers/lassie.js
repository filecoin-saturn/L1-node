import http from "node:http";
import https from "node:https";

import { CarBlockIterator } from "@ipld/car";
import LRU from "lru-cache";
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

export function respondFromLassie(req, res, { cid, format }) {
  debug(`Fetch ${req.path} from Lassie`);

  const isRawFormat = format === "raw";
  const isInBlockCache = isRawFormat && !req.params.path && blockCache.has(cid);
  if (isInBlockCache) {
    const block = blockCache.get(cid);
    return respondFromBlockCache(req, res, cid, block);
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
        }

        if (isRawFormat) {
          getRequestedBlockFromCar(fetchRes, res).catch((err) => debug(err));
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
      debug.extend("error")("Client aborted early, terminating gateway request");
      lassieReq.destroy();
    }
  });
}

/**
 * @param {IncomingMessage || ReadableStream} req
 * @param {Response} res
 * @param {string} cid
 * @param {Uint8Array} block
 */
function respondFromBlockCache(req, res, cid, block) {
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
 */
async function getRequestedBlockFromCar(streamIn, streamOut) {
  const carBlockIterator = await CarBlockIterator.fromIterable(streamIn);
  let count = 0;

  for await (const { cid, bytes } of carBlockIterator) {
    if (!validateCarBlock(cid, bytes)) {
      streamOut.status(502);
      break;
    }

    // Is it safe to assume the first block is the requested one?
    if (count === 0) {
      await write(streamOut, bytes);
      streamOut.end();
    } else {
      blockCache.set(cid.toString(), bytes);
    }
    count++;
  }
}
