import fsPromises from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mimeTypes from "mime-types";
import asyncHandler from "express-async-handler";
import { CID } from "multiformats";

import { respondFromIPFSGateway } from "./fetchers/ipfs-gateway.js";
import { respondFromLassie } from "./fetchers/lassie.js";
import { maybeRespondFromL2, registerL2Node, cancelCarRequest } from "./fetchers/l2-node.js";
import { addRegisterCheckRoute } from "./modules/registration.js";
import { NODE_VERSION, SATURN_NETWORK, TESTING_CID } from "./config.js";
import { getResponseFormat } from "./utils/http.js";
import { debug } from "./utils/logging.js";

const rootCidRegex = /^\/ip[fn]s\/[^/]+$/;

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
  try {
    CID.parse(cid);
  } catch (err) {
    debug.extend("error")(`Invalid CID "${cid}"`);
    return res.status(400).end("Invalid CID");
  }

  const format = getResponseFormat(req);

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
    res.set("Saturn-Node-Version", NODE_VERSION);
    return res.send(testCAR);
  }

  debug(`Cache miss for ${req.path}`);

  if (req.headers["x-fetcher"]?.includes("bifrost-gateway")) {
    return respondFromLassie(req, res, { cid, format });
  }

  if (SATURN_NETWORK !== "main" && !req.params.path && (await maybeRespondFromL2(req, res, { cid, format }))) {
    return;
  }

  respondFromIPFSGateway(req, res, { cid, format });
});

// Whenever nginx doesn't have a CAR file in cache, this is called
app.get("/ipfs/:cid", handleCID);
app.get("/ipfs/:cid/:path*", handleCID);

app.get("/register/:l2NodeId", asyncHandler(registerL2Node));
app.post("/data/:cid", cancelCarRequest);

addRegisterCheckRoute(app);

export default app;
