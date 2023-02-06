import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import fetch from "node-fetch";
import { Agent } from "https";

import { NODE_UA, ORCHESTRATOR_URL } from "../config.js";
import { debug as Debug } from "./logging.js";
import { orchestratorAgent } from "./http.js";

const debug = Debug.extend("cache-prefill");

export const prefillCache = () => {
  getTopCids()
    .then(async (topCids) => {
      for (const num of [1, 2]) {
        debug(`Prefilling cache with ${topCids.length} CIDs. ${num}/2`);
        for (const cid of topCids) {
          const controller = new AbortController();
          const signal = controller.signal;
          await fetch(`https://127.0.0.1/ipfs/${cid}`, {
            signal,
            agent: new Agent({ rejectUnauthorized: false }),
          });
          controller.abort();
          await setTimeoutPromise(2000);
        }
      }

      debug("Cache prefill complete");
    })
    .catch((err) => {
      debug(`Failed to prefill cache: ${err.message}`);
    });
};

async function getTopCids() {
  try {
    return await fetch(`${ORCHESTRATOR_URL}/top-cids`, {
      agent: orchestratorAgent,
      headers: {
        "User-Agent": NODE_UA,
      },
    }).then((res) => res.json());
  } catch (err) {
    debug(`Failed to fetch top CIDs: ${err.message}`);
    return [];
  }
}
