import { cpus } from "node:os";
import http from "node:http";
import https from "node:https";

import { streamCAR } from "../utils/car.js";
import { proxyRequestHeaders, proxyResponseHeaders, toUtf8 } from "../utils/http.js";
import { debug as Debug } from "../utils/logging.js";
import { IPFS_GATEWAY_ORIGIN } from "../config.js";

const debug = Debug.extend("ipfs-gw");
const debugErr = debug.extend("error");

const GATEWAY_TIMEOUT = 120_000;

const agentOpts = {
  keepAlive: true,
  maxSockets: Math.max(Math.floor(100 / cpus().length), 1),
};
const httpsAgent = new https.Agent(agentOpts);
const httpAgent = new http.Agent(agentOpts);

export function respondFromIPFSGateway(req, res, { cid, format }) {
  debug(`Fetch ${req.path}`);

  const ipfsUrl = new URL(IPFS_GATEWAY_ORIGIN + toUtf8(req.path));
  if (format) {
    ipfsUrl.searchParams.set("format", format);
  }
  for (const [key, val] of Object.entries(req.query)) {
    ipfsUrl.searchParams.set(key, toUtf8(val));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT);

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
      (fetchRes) => {
        clearTimeout(timeout);
        const { statusCode } = fetchRes;
        if (statusCode === 200) {
          res.set("Cache-Control", "public, max-age=29030400, immutable");
        } else if (statusCode >= 400) {
          debugErr(`Invalid response (${statusCode}) for ${cid}`);
        }

        res.status(statusCode);
        proxyResponseHeaders(fetchRes.headers, res);

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
      debugErr(`Error fetching ${cid}: ${err.name} ${err.message}`);
      if (controller.signal.aborted) {
        return res.sendStatus(504);
      }
      if (!res.headersSent) res.sendStatus(502);
    })
    .on("timeout", () => {
      clearTimeout(timeout);
      debugErr(`Timeout for ${cid}`);
      ipfsReq.destroy();
      res.destroy();
    });

  req.on("close", () => {
    clearTimeout(timeout);
    if (!res.writableEnded) {
      debugErr("Client aborted early, terminating request");
      ipfsReq.destroy();
    }
  });
}
