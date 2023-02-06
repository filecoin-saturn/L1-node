import { cpus } from "node:os";
import http from "node:http";
import https from "node:https";

import { streamCAR } from "./utils/car.js";
import { proxyRequestHeaders, proxyResponseHeaders, toUtf8 } from "../utils/http.js";
import { debug } from "../utils/logging.js";
import { IPFS_GATEWAY_ORIGIN } from "../config.js";

const GATEWAY_TIMEOUT = 120_000;

const agentOpts = {
  keepAlive: true,
  maxSockets: Math.floor(128 / cpus().length),
};
const httpsAgent = new https.Agent(agentOpts);
const httpAgent = new http.Agent(agentOpts);

export function respondFromIPFSGateway(req, res, { cid, format }) {
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
