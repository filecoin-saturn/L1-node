import fetch from "node-fetch";

import { NODE_UA, ORCHESTRATOR_URL } from "../config.js";
import { orchestratorAgent } from "../utils/http.js";
import { debug as Debug } from "../utils/logging.js";

const debug = Debug.extend("local-nodes");

export let localNodes = [];

export async function refreshLocalNodes() {
  debug("Refreshing local nodes");
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/nodes/local`, {
      agent: orchestratorAgent,
      headers: {
        "User-Agent": NODE_UA,
      },
    });
    localNodes = await res.json();
    debug(`Local nodes refreshed, ${localNodes.length} nodes found`);
  } catch (err) {
    debug(`Failed to refresh local nodes: ${err.message}`);
  }
  setTimeout(refreshLocalNodes, 10 * 60 * 1000);
}
