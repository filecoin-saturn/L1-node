import { cpus } from "node:os";
import https from "node:https";

import { streamCAR } from "../utils/car.js";
import { proxyRequestHeaders, proxyResponseHeaders, toUtf8 } from "../utils/http.js";
import { debug as Debug } from "../utils/logging.js";

const debug = Debug.extend("http-origin");
const debugErr = debug.extend("error");

const GATEWAY_TIMEOUT = 120_000;

const agentOpts = {
  keepAlive: true,
  maxSockets: Math.max(Math.floor(100 / cpus().length), 1),
};
const httpsAgent = new https.Agent(agentOpts);

export function respondFromHttp(req, res, { cid }) {
  const origin = req.params.origin;
  const originPrefix = `${origin}${req.query.prefix ? `/${req.query.prefix}` : ""}`;
  const cidPath = `${req.params.cid}${req.params.path ? "/" + req.params.path : ""}`;

  debug(`Fetch ${cidPath} from ${originPrefix}`);

  const customOriginUrl = new URL(`https://${originPrefix}/${cidPath}`);
  for (const [key, val] of Object.entries(req.query)) {
    customOriginUrl.searchParams.set(key, toUtf8(val));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT);

  const httpOriginReq = https
    .get(
      customOriginUrl,
      {
        agent: httpsAgent,
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

        if (fetchRes.headers["content-type"].startsWith("application/vnd.ipld.car")) {
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
      httpOriginReq.destroy();
      res.destroy();
    });

  httpOriginReq.on("close", () => {
    clearTimeout(timeout);
    if (!res.writableEnded) {
      debugErr("Client aborted early, terminating request");
      httpOriginReq.destroy();
    }
  });
}
