import http from "node:http";
import https from "node:https";
import fsPromises from "node:fs/promises";
import { cpus } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mimeTypes from "mime-types";
import crypto from "node:crypto";
import xorDistance from "xor-distance";
import pDefer from "p-defer";
import pTimeout from "p-timeout";
import timers from "node:timers/promises";
import asyncHandler from "express-async-handler";
import { CID } from "multiformats";

import { addRegisterCheckRoute } from "./modules/registration.js";
import {
  IPFS_GATEWAY_ORIGIN,
  L2_FIRE_AND_FORGET,
  NODE_UA,
  NODE_VERSION,
  SATURN_NETWORK,
  TESTING_CID,
} from "./config.js";
import { streamCAR, streamRawFromCAR } from "./utils/car.js";
import { debug } from "./utils/logging.js";

const GATEWAY_TIMEOUT = 120_000;
const PROXY_REQUEST_HEADERS = [
  "cache-control",
  // nginx with proxy-cache does not pass the "if-none-match" request header
  // to the origin. The fix is to pass a custom header.
  "x-if-none-match",
];
const PROXY_RESPONSE_HEADERS = [
  "content-disposition",
  "content-type",
  "content-length",
  "cache-control",
  "etag",
  "last-modified",
  "location",
  "x-ipfs-path",
  "x-ipfs-roots",
  "x-ipfs-datasize",
  "x-content-type-options",
];
const rootCidRegex = /^\/ip[fn]s\/[^/]+$/;

const agentOpts = {
  keepAlive: true,
  maxSockets: Math.floor(128 / cpus().length),
};
const httpsAgent = new https.Agent(agentOpts);
const httpAgent = new http.Agent(agentOpts);

const app = express();

const testCAR = await fsPromises.readFile(
  join(dirname(fileURLToPath(import.meta.url)), "..", "public", `${TESTING_CID}.car`)
);

const connectedL2Nodes = new Map();
const openCARRequests = new Map();

function removeConnectedL2Node(id) {
  const { res, cleanedUp } = connectedL2Nodes.get(id);
  cleanedUp.value = true;
  res.end();
  connectedL2Nodes.delete(id);
}

app.disable("x-powered-by");
app.set("trust proxy", true);

app.get("/favicon.ico", (req, res) => {
  res.sendStatus(404);
});

const handleCID = asyncHandler(async (req, res) => {
  // Prevent Service Worker registration on namespace roots
  // https://github.com/ipfs/kubo/issues/4025
  if (req.headers["service-worker"] === "script" && rootCidRegex.test(req.path)) {
    const msg = "navigator.serviceWorker: registration is not allowed for this scope";
    return res.status(400).send(msg);
  }

  const cid = req.params.cid;
  try {
    CID.parse(cid);
  } catch (err) {
    debug.extend("error")(`Invalid CID "${cid}"`);
    return res.status(400).end("Invalid CID");
  }

  const format = getResponseFormat(req);

  res.set("Content-Type", mimeTypes.lookup(req.path) || "application/octet-stream");

  if (req.headers.range) {
    let [start, end] = req.headers.range.split("=")[1].split("-");
    start = parseInt(start, 10);
    end = parseInt(end, 10);

    res.set({
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${testCAR.length}`,
    });
    return res.status(206).end(testCAR.slice(start, end + 1));
  }

  // Testing CID
  if (cid === TESTING_CID) {
    res.set("Saturn-Node-Version", NODE_VERSION);
    return res.send(testCAR);
  }

  debug(`Cache miss for ${req.path}`);

  if (SATURN_NETWORK !== "main" && !req.params.path && (await maybeRespondFromL2(req, res, { cid, format }))) {
    return;
  }

  respondFromIPFSGateway(req, res, { cid, format });
});

// Whenever nginx doesn't have a CAR file in cache, this is called
app.get("/ipfs/:cid", handleCID);
app.get("/ipfs/:cid/:path*", handleCID);

function respondFromIPFSGateway(req, res, { cid, format }) {
  debug(`Fetch ${req.path} from IPFS`);

  const ipfsUrl = new URL(IPFS_GATEWAY_ORIGIN + toUtf8(req.path));
  if (format) {
    ipfsUrl.searchParams.set("format", format);
  }
  for (const [key, val] of Object.entries(req.query)) {
    ipfsUrl.searchParams.set(key, toUtf8(val));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, GATEWAY_TIMEOUT);

  const _http = ipfsUrl.protocol === "https:" ? https : http;
  const agent = ipfsUrl.protocol === "https:" ? httpsAgent : httpAgent;

  const ipfsReq = _http
    .get(
      ipfsUrl,
      {
        agent,
        timeout: GATEWAY_TIMEOUT,
        headers: proxyRequestHeaders(req.headers),
        signal: controller.signal,
      },
      async (fetchRes) => {
        clearTimeout(timeout);
        const { statusCode } = fetchRes;
        if (statusCode === 200) {
          res.set("Cache-Control", "public, max-age=29030400, immutable");
        } else if (statusCode >= 400) {
          debug.extend("error")(`Invalid response from IPFS gateway (${statusCode}) for ${cid}`);
        }

        res.status(statusCode);
        proxyResponseHeaders(fetchRes, res);

        if (format === "car") {
          streamCAR(fetchRes, res).catch(() => {});
        } else {
          res.set("Accept-Ranges", "bytes");
          fetchRes.pipe(res);
        }
      }
    )
    .on("error", (err) => {
      clearTimeout(timeout);
      debug.extend("error")(`Error fetching from IPFS gateway for ${cid}: ${err.name} ${err.message}`);
      if (controller.signal.aborted) {
        return res.sendStatus(504);
      }
      if (!res.headersSent) res.sendStatus(502);
    })
    .on("timeout", () => {
      clearTimeout(timeout);
      debug.extend("error")(`Timeout from IPFS gateway for ${cid}`);
      ipfsReq.destroy();
      res.destroy();
    });

  req.on("close", () => {
    clearTimeout(timeout);
    if (!res.writableEnded) {
      debug.extend("error")("Client aborted early, terminating gateway request");
      ipfsReq.destroy();
    }
  });
}

async function maybeRespondFromL2(req, res, { cid, format }) {
  debug(`Fetch ${req.path} from L2s`);
  const cidHash = crypto.createHash("sha512").update(cid).digest();
  Array.from(connectedL2Nodes.values())
    .map((l2Node) => ({
      ...l2Node,
      distance: xorDistance(cidHash, l2Node.idHash),
    }))
    .sort((a, b) => xorDistance.compare(a.distance, b.distance))
    .slice(0, 3)
    .forEach(({ res }) => {
      const payload = {
        requestId: req.get("saturn-transfer-id"),
        root: cid,
      };
      res.write(`${JSON.stringify(payload)}\n`);
    });
  if (L2_FIRE_AND_FORGET) {
    return false;
  }

  const onResponse = pDefer();
  openCARRequests.set(cid, onResponse);

  let carResponse;
  try {
    carResponse = await pTimeout(onResponse.promise, {
      milliseconds: 10_000,
    });
  } catch {}
  if (carResponse) {
    try {
      if (format === "car") {
        await streamCAR(carResponse.req, res);
      } else {
        await streamRawFromCAR(carResponse.req, res);
      }
      return true;
    } finally {
      carResponse.res.end();
    }
  }
  return false;
}

app.get(
  "/register/:l2NodeId",
  asyncHandler(async function (req, res) {
    res.writeHead(200, {
      "Cache-Control": "no-cache",
    });
    const { l2NodeId } = req.params;
    if (connectedL2Nodes.has(l2NodeId)) {
      removeConnectedL2Node(l2NodeId);
    }
    const cleanedUp = { value: false };
    connectedL2Nodes.set(l2NodeId, {
      res,
      cleanedUp,
      idHash: crypto.createHash("sha512").update(l2NodeId).digest(),
    });
    while (!res.destroyed) {
      res.write("\n");
      await timers.setTimeout(5_000);
    }
    if (!cleanedUp.value) {
      removeConnectedL2Node(l2NodeId);
    }
  })
);

app.post("/data/:cid", function (req, res) {
  const { cid } = req.params;
  const openCARRequest = openCARRequests.get(cid);
  if (!openCARRequest) {
    res.end();
    return;
  }
  openCARRequests.delete(cid);
  openCARRequest.resolve({ req, res });
});

addRegisterCheckRoute(app);

function proxyRequestHeaders(reqHeaders) {
  const headers = { "User-Agent": NODE_UA };

  for (const key of PROXY_REQUEST_HEADERS) {
    if (key in reqHeaders) {
      if (key === "x-if-none-match") {
        headers["if-none-match"] = reqHeaders[key];
      } else {
        headers[key] = reqHeaders[key];
      }
    }
  }

  return headers;
}

// https://github.com/ipfs/specs/blob/main/http-gateways/PATH_GATEWAY.md#response-headers
function proxyResponseHeaders(ipfsRes, nodeRes) {
  for (const key of PROXY_RESPONSE_HEADERS) {
    if (key in ipfsRes.headers) {
      nodeRes.set(key, ipfsRes.headers[key]);
    }
  }
}

function getResponseFormat(req) {
  // ipfs gw returns default format for invalid formats
  if (req.query.format) {
    return req.query.format;
  } else if (req.headers.accept === "application/vnd.ipld.car") {
    return "car";
  } else if (req.headers.accept === "application/vnd.ipld.raw") {
    return "raw";
  } else {
    return null;
  }
}

// HTTP Parser decodes with latin1 instead of utf8, so any unencoded chars
// like 'тест' will be decoded into garbage.
// https://github.com/nodejs/node/issues/17390
function toUtf8(str) {
  return Buffer.from(str, "binary").toString("utf8");
}

export default app;
