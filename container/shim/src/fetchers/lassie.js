import http from "node:http";
import https from "node:https";
import { Transform } from "node:stream";

import { CarBlockIterator } from "@ipld/car";
import LRU from "lru-cache";
import { base64 } from "multiformats/bases/base64";
import fetch from "node-fetch";

import { LASSIE_ORIGIN } from "../config.js";
import { submitLassieLogs } from "../modules/log_ingestor.js";
import { streamCAR, validateCarBlock } from "../utils/car.js";
import { proxyResponseHeaders, toUtf8 } from "../utils/http.js";
import { debug as Debug } from "../utils/logging.js";

const debug = Debug.extend("lassie");
const debugErr = debug.extend("error");
debug.enabled = false; // temporary until Lassie is stable.

const LASSIE_TIMEOUT = 120_000;

const agentOpts = { keepAlive: true };
const httpsAgent = new https.Agent(agentOpts);
const httpAgent = new http.Agent(agentOpts);

const blockCache = new LRU({
  maxSize: 1024 ** 3, // 1 GB
  sizeCalculation: (block) => Buffer.byteLength(block),
  allowStale: true,
});
const cidToCacheKey = (cidObj) => base64.baseEncode(cidObj.multihash.bytes);

let metrics = [];
let lastMetricsReportDate = null;
const METRICS_REPORT_INTERVAL = 5_000;

export async function respondFromLassie(req, res, { cidObj, format }) {
  debug(`Fetch ${req.path}`);

  const requestId = req.headers["saturn-transfer-id"];
  const cacheKey = cidToCacheKey(cidObj);
  const cidV1 = cidObj.toV1();
  const cid = cidV1.toString();
  const isRawFormat = format === "raw";
  const isInBlockCache = isRawFormat && !req.params.path && blockCache.has(cacheKey);

  if (isInBlockCache) {
    const block = blockCache.get(cacheKey);
    return sendBlockResponse(res, block, cid);
  }

  const startTime = new Date();
  let endTime = null;
  let ttfbTime = null;
  let numBytesDownloaded = 0;

  const lassieUrl = new URL(LASSIE_ORIGIN + toUtf8(req.path));
  for (const [key, val] of Object.entries(req.query)) {
    lassieUrl.searchParams.set(key, toUtf8(val));
  }
  lassieUrl.searchParams.set("format", "car");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LASSIE_TIMEOUT);

  const agent = lassieUrl.protocol === "https:" ? httpsAgent : httpAgent;

  // No transform, just observe data to record metrics.
  const metricsStream = new Transform({
    transform(chunk, encoding, cb) {
      if (ttfbTime === null) {
        ttfbTime = new Date();
      }
      numBytesDownloaded += chunk.length;
      cb(null, chunk);
    },
  });

  req.on("close", () => {
    clearTimeout(timeoutId);
    if (!res.writableEnded) {
      debugErr("Client aborted early, terminating request");
      controller.abort();
    }
  });

  let lassieRes;
  let requestErr;

  try {
    const fetchOpts = {
      agent,
      signal: controller.signal,
      headers: {
        "X-Request-ID": requestId,
      },
    };
    lassieRes = await fetch(lassieUrl, fetchOpts);

    const { status } = lassieRes;
    res.status(status);

    if (!lassieRes.ok) {
      debugErr(`Invalid status (${status}) for ${cid}`);
      return res.end();
    } else {
      res.set("Cache-Control", "public, max-age=29030400, immutable");
    }
    const carStream = lassieRes.body.pipe(metricsStream);

    if (isRawFormat) {
      await getRequestedBlockFromCar(carStream, res, cidV1, req.params.path);
    } else {
      proxyResponseHeaders(lassieRes, res);
      await streamCAR(carStream, res);
    }
  } catch (err) {
    if (controller.signal.aborted) {
      debugErr(`Timeout for ${cid}`);
      res.sendStatus(504);
    } else {
      debugErr(`Error fetching ${cid}: ${err.name} ${err.message}`);

      if (!res.headersSent) res.sendStatus(502);
    }

    requestErr = err.message;
  } finally {
    clearTimeout(timeoutId);
    endTime = new Date();

    queueMetricsReport({
      startTime,
      ttfbTime,
      endTime,
      numBytesDownloaded,
      requestId,
      url: req.protocol + "://" + req.get("host") + req.originalUrl,
      httpStatusCode: lassieRes?.status ?? null,
      requestErr,
    });
  }
}

/**
 * @param {Response} res
 * @param {Uint8Array} block
 * @param {string} cid
 */
function sendBlockResponse(res, block, cid) {
  res.status(200);
  res.set("content-length", Buffer.byteLength(block));
  res.set("content-type", "application/vnd.ipld.raw");
  res.set("content-disposition", `attachment; filename="${cid}.bin"`);
  res.set("etag", `"${cid}.raw"`);
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

      sendBlockResponse(streamOut, bytes, cidV1.toString());
    } else {
      const cacheKey = cidToCacheKey(cidV1);
      blockCache.set(cacheKey, bytes);
    }
    count++;
  }
}

async function queueMetricsReport(newMetric) {
  metrics.push(newMetric);

  const date = lastMetricsReportDate;
  const canReport = !date || new Date() - date > METRICS_REPORT_INTERVAL;
  if (!canReport) {
    return;
  }

  const chunkSize = 500;
  const promises = [];

  for (let i = 0; i < metrics.length; i += chunkSize) {
    const logs = metrics.slice(i, i + chunkSize);
    promises.push(submitLassieLogs(logs));
  }

  metrics = [];
  lastMetricsReportDate = new Date();

  try {
    await Promise.all(promises);
  } catch (err) {
    debugErr(err);
  }
}
