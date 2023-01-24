import fs from "node:fs/promises";
import fetch from "node-fetch";
import prettyBytes from "pretty-bytes";
import logfmt from "logfmt";
import readlines from "../utils/readlines.js";

import { FIL_WALLET_ADDRESS, LOG_INGESTOR_URL, nodeId, nodeToken, TESTING_CID } from "../config.js";
import { debug as Debug } from "../utils/logging.js";

const debug = Debug.extend("log-ingestor");

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
    const url = new URL(`${values.scheme}://${values.host}${values.uri}`);
    url.searchParams.set("ua", values.ua);
    url.searchParams.set("rid", values.id);
    return url;
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
async function submitLogs(logs) {
  // cache hit rate for this batch of retrievals
  const cacheHits = logs.filter(({ cacheHit }) => cacheHit).length;
  const cacheHitRate = cacheHits / logs.length;
  const cacheHitRatePercent = Math.round(cacheHitRate * 100);

  // total bytes sent to clients for this batch or retrievals
  const totalBytesSent = logs.reduce((acc, { numBytesSent }) => acc + numBytesSent, 0);
  const totalBytesSentPretty = prettyBytes(totalBytesSent);

  debug(`Submitting ${logs.length} retrievals (${totalBytesSentPretty} with cache rate of ${cacheHitRatePercent}%)`);

  const submitTime = Date.now();

  await fetch(LOG_INGESTOR_URL, {
    method: "POST",
    body: JSON.stringify({ nodeId, filAddress: FIL_WALLET_ADDRESS, bandwidthLogs: logs }),
    headers: { Authentication: nodeToken, "Content-Type": "application/json" },
  });

  debug(`Retrievals submitted succesfully to wallet ${FIL_WALLET_ADDRESS} in ${Date.now() - submitTime}ms`);
}

/**
 * Runs the log ingestor function responsible for reading the nginx log file and submitting the logs to the orchestrator.
 * It starts immediately once this function is called, calls itself recursively until the log file is read in full, and
 * then sets a timeout to call itself again after at most 1 minute from the last time it was called. It keeps track of
 * the last line read in the log file and only reads the lines after that line.
 * This function can be called manually to force a log ingestor submission (e.g. when node is shutting down).
 *
 * @returns {Promise<void>} - resolves once the log ingestor finished current run and is scheduled to run again.
 */
export default async function startLogIngestor() {
  // clear timeout timer if it exists (this is to prevent multiple timers from being set)
  if (startLogIngestor.timeout) clearTimeout(startLogIngestor.timeout);

  const startTime = Date.now();

  if (await isFileAccessible(LOG_FILE)) {
    // stream the log file and parse the lines
    const read = await readlines(LOG_FILE);

    if (read.lines.length) {
      const logs = [];

      for (let i = 0; i < read.lines.length; i++) {
        // skip empty lines
        if (read.lines[i] === "") continue;

        // parse the line into an object
        const parsed = parseSingleLine(read.lines[i]);

        // add parsed log line if it is valid (only valid retrieval)
        if (parsed) logs.push(parsed);
      }

      // submit the logs to the log ingestor
      if (logs.length) {
        try {
          // submit parsed logs to the orchestrator
          await submitLogs(logs);

          // mark the lines as read once they have been submitted successfully
          // which persists new read bytes offset to the disk so it will not be read again
          await read.confirmed();
        } catch (error) {
          debug(`Failed to submit ${logs.length} retrievals: ${error.name} ${error.message}`);
        }
      } else {
        debug(`No retrievals to submit since ${new Date(startTime).toISOString()}`);
      }
    }

    // run this function again immediately if there were more lines to read (read.eof is false)
    if (read.eof === false) return startLogIngestor();
  }

  // ... otherwise, wait up to 60 seconds from the start of this function before running again
  startLogIngestor.timeout = setTimeout(startLogIngestor, Math.max(0, 60_000 - (Date.now() - startTime)));
}
