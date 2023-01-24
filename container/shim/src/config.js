import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "fs/promises";

const NODE_ID_FILE_PATH = "./shared/nodeId.txt";
const NODE_ID_NGINX_CONF = "./shared/nginx_conf/node_id.conf";

export const DEV_VERSION = "9999_dev";
export const NODE_VERSION = pVersion(process.env.NODE_VERSION || DEV_VERSION);
export const NODE_UA = `Saturn/${NODE_VERSION}`;
export const PORT = 10361;
export const SATURN_NETWORK = process.env.SATURN_NETWORK;
export const SPEEDTEST_SERVER_CONFIG = process.env.SPEEDTEST_SERVER_CONFIG || "";
export const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || networkToOrchestrator();
export const LOG_INGESTOR_URL = process.env.LOG_INGESTOR_URL || networkToIngestor();
export const FIL_WALLET_ADDRESS = process.env.FIL_WALLET_ADDRESS || error("FIL_WALLET_ADDRESS");
export const NODE_OPERATOR_EMAIL = process.env.NODE_OPERATOR_EMAIL || error("NODE_OPERATOR_EMAIL");
export const IPFS_GATEWAY_ORIGIN = process.env.IPFS_GATEWAY_ORIGIN || "https://ipfs.io";
export const TESTING_CID = "QmXjYBY478Cno4jzdCcPy4NcJYFrwHZ51xaCP8vUwN9MGm";

export const nodeId = await readOrCreateNodeId();
export const L2_FIRE_AND_FORGET = process.env.L2_FIRE_AND_FORGET
  ? process.env.L2_FIRE_AND_FORGET === "true"
  : SATURN_NETWORK === "test";
export const ORCHESTRATOR_REGISTRATION = process.env.ORCHESTRATOR_REGISTRATION
  ? process.env.ORCHESTRATOR_REGISTRATION === "true"
  : true;

export let nodeToken = "";
export const updateNodeToken = (newToken) => {
  nodeToken = newToken;
};

function networkToOrchestrator() {
  switch (SATURN_NETWORK) {
    case "main": {
      return "https://orchestrator.strn.pl";
    }
    case "test": {
      return "https://orchestrator.strn-test.pl";
    }
    default: {
      return "http://localhost:10365";
    }
  }
}

function networkToIngestor() {
  switch (SATURN_NETWORK) {
    case "main": {
      return "https://twb3qukm2i654i3tnvx36char40aymqq.lambda-url.us-west-2.on.aws/";
    }
    case "test": {
      return "https://p6wofrb2zgwrf26mcxjpprivie0lshfx.lambda-url.us-west-2.on.aws/";
    }
    default: {
      return "http://localhost:10364";
    }
  }
}

function error(requiredVarName) {
  throw new Error(`${requiredVarName} missing in process env`);
}

function pVersion(version) {
  return version.slice(0, version.indexOf("_") + 8);
}

async function readOrCreateNodeId() {
  let nodeId;
  try {
    nodeId = (await readFile(NODE_ID_FILE_PATH, "utf8")).trim();
  } catch (err) {
    nodeId = createNodeId();
  }
  writeFile(NODE_ID_NGINX_CONF, `set $node_id "${nodeId}";`).catch(console.error); // eslint-disable-line no-console
  return nodeId;
}

function createNodeId() {
  const newNodeId = randomUUID();
  writeFile(NODE_ID_FILE_PATH, newNodeId).catch(console.error); // eslint-disable-line no-console
  return newNodeId;
}
