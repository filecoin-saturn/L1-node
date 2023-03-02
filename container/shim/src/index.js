import fsPromises from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mimeTypes from "mime-types";
import asyncHandler from "express-async-handler";
import { CID } from "multiformats";

import { respondFromIPFSGateway } from "./fetchers/ipfs-gateway.js";
import { respondFromLassie } from "./fetchers/lassie.js";
import { cancelCarRequest, maybeRespondFromL2, registerL2Node } from "./fetchers/l2-node.js";
import { addRegisterCheckRoute } from "./modules/registration.js";
import { LASSIE_ORIGIN, SATURN_NETWORK, TESTING_CID, IS_CORE_L1 } from "./config.js";
import { getResponseFormat } from "./utils/http.js";
import { debug } from "./utils/logging.js";

const rootCidRegex = /^\/ip[fn]s\/[^/]+$/;
const LASSIE_SAMPLE_RATE = 1;

const app = express();

const testCAR = await fsPromises.readFile(
  join(dirname(fileURLToPath(import.meta.url)), "..", "public", `${TESTING_CID}.car`)
);

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
  let cidObj;
  try {
    cidObj = CID.parse(cid);
  } catch (err) {
    debug.extend("error")(`Invalid CID "${cid}"`);
    return res.status(400).end("Invalid CID");
  }

  const format = getResponseFormat(req);
  const isVerifiableFormat = ["car", "raw"].includes(format);
  const isNotImplemented = !isVerifiableFormat && !IS_CORE_L1;

  if (isNotImplemented) {
    return res.sendStatus(501);
  }

  res.set("Content-Type", mimeTypes.lookup(req.path) || "application/octet-stream");

  if (req.headers.range && cid === TESTING_CID) {
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
    return res.send(testCAR);
  }

  if (SATURN_NETWORK !== "main" && !req.params.path && (await maybeRespondFromL2(req, res, { cid, format }))) {
    return;
  }

  const isBifrostGateway = req.headers["user-agent"]?.includes("bifrost-gateway");
  const isSampled = Math.random() < LASSIE_SAMPLE_RATE;
  const useLassie = isBifrostGateway || isSampled;

  if (useLassie && LASSIE_ORIGIN) {
    return respondFromLassie(req, res, { cidObj, format });
  }

  respondFromIPFSGateway(req, res, { cid, format });
});

// Whenever nginx doesn't have a CAR file in cache, this is called
app.get("/ipfs/:cid", handleCID);
app.get("/ipfs/:cid/:path(*)", handleCID);

app.get("/register/:l2NodeId", asyncHandler(registerL2Node));
app.post("/data/:cid", cancelCarRequest);

addRegisterCheckRoute(app);

export default app;
