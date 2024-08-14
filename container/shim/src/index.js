import fsPromises from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import express from "express";
import asyncHandler from "express-async-handler";
import mimeTypes from "mime-types";
import { CID } from "multiformats";
import serverTiming from "server-timing";
import { IS_CORE_L1, NETWORK, NODE_ID, ORCHESTRATOR_REGISTRATION, TESTING_CID } from "./config.js";
import { respondFromLassie } from "./fetchers/lassie.js";
import { addRegisterCheckRoute } from "./modules/registration.js";
import { getResponseFormat } from "./utils/http.js";
import { debug } from "./utils/logging.js";

const rootCidRegex = /^\/ip[fn]s\/[^/]+$/;

const app = express();

Sentry.init({
  enabled: ["main", "test"].includes(NETWORK) && ORCHESTRATOR_REGISTRATION,
  integrations: [
    new Sentry.Integrations.Http(),
    new Sentry.Integrations.Express({ app }),
    new Sentry.Integrations.OnUncaughtException(),
    new Sentry.Integrations.OnUnhandledRejection(),
  ],
  environment: NETWORK,
  serverName: NODE_ID,
});

const testCAR = await fsPromises.readFile(
  join(dirname(fileURLToPath(import.meta.url)), "..", "public", `${TESTING_CID}.car`)
);

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(serverTiming({ total: false }));

app.get("/favicon.ico", (req, res) => {
  res.sendStatus(404);
});

const handleCID = asyncHandler(async (req, res) => {
  // Prevent Service Worker registration on namespace roots
  const isRootCid = rootCidRegex.test(req.path);
  if (req.headers["service-worker"] === "script" && isRootCid) {
    const msg = "navigator.serviceWorker: registration is not allowed for this scope";
    return res.status(400).send(msg);
  }

  res.startTime("shim");

  const cid = req.params.cid;
  let cidObj;
  try {
    cidObj = CID.parse(cid);
  } catch (err) {
    debug.extend("error")(`Invalid CID "${cid}"`);
    return res.status(400).end("Invalid CID");
  }

  const format = getResponseFormat(req);
  const isVerifiableFormat = ["car", "raw"].includes(format);
  const isNonRootRaw = format === "raw" && !isRootCid;
  const isNotImplemented = (!isVerifiableFormat || isNonRootRaw) && !IS_CORE_L1;

  if (isNotImplemented) {
    return res.sendStatus(501);
  }

  res.set("Content-Type", mimeTypes.lookup(req.path) || "application/octet-stream");

  if (req.headers.range && cid === TESTING_CID) {
    const range = req.headers.range.split("=")[1].split("-");
    let start = parseInt(range[0], 10);
    let end = parseInt(range[1], 10);

    if (isNaN(start) || isNaN(end) || start < 0 || end < start) {
      return res.status(400).end("Invalid range values");
    }

    res.set({
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${testCAR.length}`,
    });
    return res.status(206).end(testCAR.slice(start, end + 1));
  }

  // Testing CID
  if (cid === TESTING_CID) {
    return res.send(testCAR);
  }

  return respondFromLassie(req, res, { cidObj, format });
});

// Whenever nginx doesn't have a CAR file in cache, this is called
app.get("/ipfs/:cid", handleCID);
app.get("/ipfs/:cid/:path(*)", handleCID);

addRegisterCheckRoute(app);

export default app;
