import crypto from "node:crypto";
import timers from "node:timers/promises";

import xorDistance from "xor-distance";
import pDefer from "p-defer";
import pTimeout from "p-timeout";

import { streamCAR, streamRawFromCAR } from "../utils/car.js";
import { debug } from "../utils/logging.js";
import { L2_FIRE_AND_FORGET } from "../config.js";

const connectedL2Nodes = new Map();
const openCARRequests = new Map();

function removeConnectedL2Node(id) {
  const { res, cleanedUp } = connectedL2Nodes.get(id);
  cleanedUp.value = true;
  res.end();
  connectedL2Nodes.delete(id);
}

export async function maybeRespondFromL2(req, res, { cid, format }) {
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

export async function registerL2Node(req, res) {
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
}

export function cancelCarRequest(req, res) {
  const { cid } = req.params;
  const openCARRequest = openCARRequests.get(cid);
  if (!openCARRequest) {
    res.end();
    return;
  }
  openCARRequests.delete(cid);
  openCARRequest.resolve({ req, res });
}
