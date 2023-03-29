import http from "node:http";
import https from "node:https";
import { Transform, pipeline } from "node:stream";

import { CarBlockIterator } from "@ipld/car";
import LRU from "lru-cache";
import { base64 } from "multiformats/bases/base64";
import fetch from "node-fetch";

import { LASSIE_ORIGIN, LASSIE_SP_ELIGIBLE_PORTION, hasNodeToken } from "../config.js";
import { submitLassieLogs } from "../modules/log_ingestor.js";
import { streamCAR, validateCarBlock } from "../utils/car.js";
import { proxyResponseHeaders, toUtf8 } from "../utils/http.js";
import { debug as Debug } from "../utils/logging.js";

const debug = Debug.extend("lassie");
const debugErr = debug.extend("error");

// Should there even be a timeout?
const LASSIE_TIMEOUT = 1_000 * 60 * 10;

const agentOpts = { keepAlive: true };
const httpsAgent = new https.Agent(agentOpts);
const httpAgent = new http.Agent(agentOpts);

const ONE_GB = 1024 ** 3;
const blockCache = new LRU({
  maxSize: ONE_GB * 3,
  sizeCalculation: (block) => Buffer.byteLength(block),
  allowStale: true,
});
const cidToCacheKey = (cidObj) => base64.baseEncode(cidObj.toV1().multihash.bytes);

let metrics = [];
let lastMetricsReportDate = null;
const METRICS_REPORT_INTERVAL = 5_000;

export async function respondFromLassie(req, res, { cidObj, format }) {
  debug(`Fetch ${req.path}`);

  res.startTime("shim/lassie");

  const requestId = req.headers["saturn-transfer-id"];
  const cacheKey = cidToCacheKey(cidObj);
  const cid = cidObj.toString();
  const isRawFormat = format === "raw";
  const isInBlockCache = isRawFormat && !req.params.path && blockCache.has(cacheKey);
  // TODO: Lassie will error if filename doesn't end in ".car"
  const blockFilename = req.query.filename ?? `${cid}.bin`;

  if (isInBlockCache) {
    const block = blockCache.get(cacheKey);
    return sendBlockResponse(res, block, cidObj, blockFilename);
  }

  const startTime = new Date();
  let endTime = null;
  let ttfbTime = null;
  let numBytesDownloaded = 0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LASSIE_TIMEOUT);

  const lassieUrl = createLassieURL(req, isRawFormat);
  const agent = lassieUrl.protocol === "https:" ? httpsAgent : httpAgent;

  // No transform, just record metrics.
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
    res.startTime("shim_lassie_headers");
    lassieRes = await fetch(lassieUrl, fetchOpts);
    res.endTime("shim_lassie_headers");

    const { status } = lassieRes;

    if (!lassieRes.ok) {
      const body = await lassieRes.text();
      debugErr(`Invalid status (${status}) for ${cid}. ${body.trim()}`);

      res.status(getSemanticErrorStatus(status, body));
      return res.end(body);
    }

    res.status(status);
    res.set("Cache-Control", "public, max-age=29030400, immutable");

    // Stream errors will be propagated to the catch block.
    pipeline(lassieRes.body, metricsStream, () => {});

    if (isRawFormat) {
      await getRequestedBlockFromCar(metricsStream, res, cidObj, blockFilename);
    } else {
      const headersObj = Object.fromEntries(lassieRes.headers.entries());
      proxyResponseHeaders(headersObj, res);
      await streamCAR(metricsStream, res);
    }
  } catch (err) {
    if (controller.signal.aborted) {
      debugErr(`Timeout for ${cid}`);

      if (!res.headersSent) res.sendStatus(504);
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

function createLassieURL(req, isRawFormat) {
  const lassieUrl = new URL(LASSIE_ORIGIN + toUtf8(req.path));
  for (const [key, val] of Object.entries(req.query)) {
    if (key === "filename") {
      continue;
    }

    // translate depth parameter for lassie
    let newKey = key;
    let newVal = val;
    if (key === "depth" && (val === "1" || val === "0")) {
      newKey = "depthType";
      newVal = "shallow";
    }
    if (key === "depth" && val === "all") {
      newKey = "depthType";
      newVal = "full";
    }
    lassieUrl.searchParams.set(newKey, toUtf8(newVal));
  }
  lassieUrl.searchParams.set("format", "car");

  // add custom limited depth limit on raw requests
  if (isRawFormat) {
    lassieUrl.searchParams.set("blockLimit", "10");
  }

  // if no depth type set
  if (!lassieUrl.searchParams.has("depthType")) {
    if (isRawFormat) {
      // for raw, default to shallow
      lassieUrl.searchParams.set("depthType", "shallow");
    } else {
      // for everything else, default to full
      lassieUrl.searchParams.set("depthType", "full");
    }
  }

  // if protocols is not set and we have a percentage set for sending requests to sps,
  // add graphsync to the protocols list on a percentage of requests
  if (!lassieUrl.searchParams.has("protocols")) {
    const chance = Math.random();
    if (chance < LASSIE_SP_ELIGIBLE_PORTION) {
      // if we are making an sp eligible request, add bitswap and graphsync
      lassieUrl.searchParams.set("protocols", "bitswap,graphsync");
    } else {
      // for everything else, just use bitswap
      lassieUrl.searchParams.set("protocols", "bitswap");
    }
  }
  return lassieUrl;
}

function getSemanticErrorStatus(status, body) {
  // 404 should only be used for DAG traversal errors.
  if (status === 404) {
    status = 502;
  }
  return status;
}

/**
 * @param {Response} res
 * @param {Uint8Array} block
 * @param {CID} cidObj
 * @param {string} filename
 */
function sendBlockResponse(res, block, cidObj, filename) {
  res.status(200);
  res.set("content-length", Buffer.byteLength(block));
  res.set("content-type", "application/vnd.ipld.raw");
  res.set("content-disposition", `attachment; filename="${filename}"`);
  res.set("etag", `"${cidObj.toString()}.raw"`);
  res.end(block);
}

/**
 * The first block is returned to the client.
 * All other blocks (if any) are written to the block cache.
 *
 * @param {IncomingMessage || ReadableStream} streamIn
 * @param {Response} streamOut
 * @param {CID} cidObj
 * @param {string} filename
 */
async function getRequestedBlockFromCar(streamIn, streamOut, cidObj, filename) {
  const carBlockIterator = await CarBlockIterator.fromIterable(streamIn);
  const roots = await carBlockIterator.getRoots();
  const rootCid = roots[0];
  const requestedCidV1 = cidObj.toV1();

  if (roots.length > 1) {
    throw new Error(`CAR file has more than one root CID.`);
  } else if (!rootCid.toV1().equals(requestedCidV1)) {
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
      if (!cidV1.equals(requestedCidV1)) {
        throw new Error(`Requested CID ${requestedCidV1} doesn't equal first block CID ${rootCid}.`);
      }

      sendBlockResponse(streamOut, bytes, cidObj, filename);
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
  if (!canReport || !hasNodeToken()) {
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
