import https from "node:https";
import http from "node:http";

import { ORCHESTRATOR_URL, NODE_UA } from "../config.js";

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

const agentOpts = {
  keepAlive: true,
};

export const orchestratorAgent = ORCHESTRATOR_URL.includes("https")
  ? new https.Agent(agentOpts)
  : new http.Agent(agentOpts);

export function proxyRequestHeaders(reqHeaders) {
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
export function proxyResponseHeaders(headersObj, nodeRes) {
  for (const key of PROXY_RESPONSE_HEADERS) {
    if (key in headersObj) {
      nodeRes.set(key, headersObj[key]);
    }
  }
}

// HTTP Parser decodes with latin1 instead of utf8, so any unencoded chars
// like 'тест' will be decoded into garbage.
// https://github.com/nodejs/node/issues/17390
export function toUtf8(str) {
  return Buffer.from(str, "binary").toString("utf8");
}

export function getResponseFormat(req) {
  // ipfs gw returns default format for invalid formats
  if (req.query.format) {
    return req.query.format;
  } else if (req.headers.accept) {
    const keys = req.headers.accept.split(',').map(key => key.trim())
    for (const key of keys) {
      if (key.startsWith("application/vnd.ipld.car")) {
        return 'car'
      } else if (key.startsWith("application/vnd.ipld.raw")) {
        return 'raw'
      }
    }
  }

  return null;
}
