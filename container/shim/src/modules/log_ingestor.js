import fs from "node:fs/promises";
import fetch from "node-fetch";
import pLimit from "p-limit";
import prettyBytes from "pretty-bytes";
import logfmt from "logfmt";
import glob from "fast-glob";
import readlines from "../utils/readlines.js";

import { FIL_WALLET_ADDRESS, LOG_INGESTOR_URL, NODE_UA, nodeId, nodeToken, TESTING_CID } from "../config.js";
import { debug as Debug } from "../utils/logging.js";

const debug = Debug.extend("log-ingestor");
const limitConcurrency = pLimit(1); // setup concurrency limit to execute one at a time

const NGINX_LOG_KEYS_MAP = {
  clientAddress: (values) => values.addr,
  numBytesSent: (values) => parseInt(values.bytes, 10),
  localTime: (values) => values.time,
  referrer: (values) => values.ref,
  requestId: (values) => values.id,
  requestDuration: (values) => parseFloat(values.rt),
  status: (values) => parseInt(values.status, 10),
  httpProtocol: (values) => values.sp,
  userAgent: (values) => values.ua,
  cacheHit: (values) => values.cache === "HIT",
  url: (values) => {
    return new URL(`${values.scheme}://${values.host}${values.uri}`);
  },
  range: (values) => values.range,
  ff: (values) => values.ff,
  uct: (values) => {
    const parsed = parseFloat(values.uct);
    return isNaN(parsed) ? values.uct : parsed;
  },
  uht: (values) => {
    const parsed = parseFloat(values.uht);
    return isNaN(parsed) ? values.uht : parsed;
  },
  urt: (values) => {
    const parsed = parseFloat(values.urt);
    return isNaN(parsed) ? values.urt : parsed;
  },
};

const LOG_FILE = "/usr/src/app/shared/nginx_log/node-access.log";

/**
 * Check if a file is accessible with the given flags.
 *
 * @param {string} filename
 * @param {number} flags - use fs.constants.R_OK, fs.constants.W_OK, etc.
 * @returns {Promise<boolean>} true if the file is accessible, false otherwise
 */
async function isFileAccessible(filename, flags = fs.constants.R_OK) {
  try {
    await fs.access(filename, flags);

    return true;
  } catch (error) {
    debug(`Cannot access ${filename} (${flags}): ${error.message}`);

    return false;
  }
}

function parseSingleLine(line) {
  // parse the line into an object
  const parsed = logfmt.parse(line);

  // use mapped keys and getters to extract the values we want
  const vars = Object.entries(NGINX_LOG_KEYS_MAP).reduce((acc, [key, getter]) => {
    acc[key] = getter(parsed);
    return acc;
  }, {});

  if (vars.clientAddress === "127.0.0.1") return null;

  // Disable lassie logs until logging backend is updated.
  if (vars.userAgent.includes("bifrost-gateway")) return null;

  const isIPFS = vars.url.pathname.startsWith("/ipfs/");
  const isIPNS = vars.url.pathname.startsWith("/ipns/");

  // only submit logs for IPFS/IPNS requests
  if (!isIPFS && !isIPNS) return null;

  const cid = vars.url.pathname.split("/")[2];

  // do not submit logs for testing CID
  if (cid === TESTING_CID) return null;

  return {
    cacheHit: vars.cacheHit,
    clientAddress: vars.clientAddress,
    localTime: vars.localTime,
    numBytesSent: vars.numBytesSent,
    range: vars.range,
    referrer: vars.referrer,
    requestDuration: vars.requestDuration,
    requestId: vars.requestId,
    userAgent: vars.userAgent,
    httpStatusCode: vars.status,
    // If/when "httpProtocol" eventually contains HTTP/3.0, then
    // the "http3" key can be removed.
    httpProtocol: vars.http3 || vars.httpProtocol,
    url: vars.url,
  };
}

/**
 * Submits parsed bandwidth logs to the orchestrator.
 *
 * @param {Array} logs - array of parsed bandwidth logs
 * @returns {Promise<void>} - resolves once the logs are successfully submitted to the orchestrator
 */
async function submitBandwidthLogs(logs) {
  // calculate total bytes sent to clients and cache hit rate for this batch or retrievals
  const { bytesSent, cacheHits } = logs.reduce(
    (acc, log) => ({
      bytesSent: acc.bytesSent + log.numBytesSent, // sum of all bytes sent to clients
      cacheHits: acc.cacheHits + (log.cacheHit ? 1 : 0), // sum of all cache hits
    }),
    { bytesSent: 0, cacheHits: 0 }
  );
  const cacheHitRate = cacheHits / logs.length;
  const cacheHitRatePercent = Math.round(cacheHitRate * 100);

  debug(`Submitting ${logs.length} retrievals (${prettyBytes(bytesSent)} with cache rate of ${cacheHitRatePercent}%)`);

  const submitTime = Date.now();

  const body = JSON.stringify({ nodeId, filAddress: FIL_WALLET_ADDRESS, bandwidthLogs: logs });
  await submitLogs(body);

  debug(`Retrievals submitted succesfully to wallet ${FIL_WALLET_ADDRESS} in ${Date.now() - submitTime}ms`);
}

export async function submitLassieLogs(lassieLogs) {
  const body = JSON.stringify({ nodeId, lassieLogs });
  await submitLogs(body);
}

async function submitLogs(body) {
  await fetch(LOG_INGESTOR_URL, {
    method: "POST",
    body,
    headers: { Authentication: nodeToken, "Content-Type": "application/json", "User-Agent": NODE_UA },
  });
}

/**
 * Runs the log ingestor function responsible for reading the nginx log file and submitting the logs to the orchestrator.
 * It starts immediately once this function is called, calls itself recursively until the log file is read in full, and
 * then sets a timeout to call itself again after at most 1 minute from the last time it was called. It keeps track of
 * the last line read in the log file and only reads the lines after that line.
 * This function can be called manually to force a log ingestor submission (e.g. when node is shutting down).
 * It also enforces a concurrency limit of 1 to prevent multiple executions of this function from running at the same time.
 *
 * @returns {Promise<void>} - resolves once the log ingestor finished current run and is scheduled to run again.
 */
export default async function startLogIngestor() {
  return limitConcurrency(executeLogIngestor);
}

async function executeLogIngestor() {
  // clear timeout timer if it exists (this is to prevent multiple timers from being set)
  if (executeLogIngestor.timeout) clearTimeout(executeLogIngestor.timeout);

  // glob all log file, include rotated logs with extensions but ignore gzipped logs
  // IMPORTANT: when rotating logs with compression, always enable delaycompress to
  // ensure that once a log file is rotated, it will still be accessible for reading
  // to finish parsing the lines before they are compressed, additionally do not use
  // copytruncate to make sure that log file is moved instead of copied and truncated
  // because we want to keep the original log file offset by matching its inode
  const logFiles = await glob(`${LOG_FILE}*`, { ignore: ["*.gz"] });

  const startTime = Date.now();

  for (const logFile of logFiles) {
    if (!(await isFileAccessible(logFile))) continue;

    // stream the log file and parse the lines
    const read = await readlines(logFile);

    const logs = [];
    for (let i = 0; i < read.lines.length; i++) {
      // skip empty lines
      if (read.lines[i] === "") continue;

      try {
        // parse the line into an object
        const parsed = parseSingleLine(read.lines[i]);

        // add parsed log line if it is valid (only valid retrieval)
        if (parsed) logs.push(parsed);
      } catch (err) {
        debug(`Failed to parse line: ${err.message}`);
      }
    }

    // submit the logs to the log ingestor
    if (logs.length) {
      try {
        // submit parsed logs to the orchestrator
        await submitBandwidthLogs(logs);

        // mark the lines as read once they have been submitted successfully
        // which persists new read bytes offset to the disk so it will not be read again
        await read.confirmed();
      } catch (error) {
        debug(`Failed to submit ${logs.length} retrievals: ${error.name} ${error.message}`);
      }
    } else {
      debug(`No retrievals to submit since ${new Date(startTime).toISOString()}`);
    }

    // run this function again immediately if there were more lines to read (read.eof is false)
    if (read.eof === false) return executeLogIngestor();
  }

  // ... otherwise, wait up to 60 seconds from the start of this function before running again
  executeLogIngestor.timeout = setTimeout(() => {
    // restart execution of ingestor again only if there are no pending executions already in the queue
    if (limitConcurrency.pendingCount === 0) startLogIngestor();
  }, Math.max(0, 60_000 - (Date.now() - startTime)));
}
