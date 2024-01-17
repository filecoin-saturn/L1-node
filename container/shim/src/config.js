import { readFile } from "fs/promises";

export const NODE_ID_FILE_PATH = "./shared/nodeId.txt";

export const DEV_VERSION = "0_dev";
export const PORT = 10361;
export const TESTING_CID = "QmXjYBY478Cno4jzdCcPy4NcJYFrwHZ51xaCP8vUwN9MGm";

// Node and network info
export const NETWORK_LEVEL = 1;
export const NODE_ID = (await readFile(NODE_ID_FILE_PATH, "utf8")).trim();
export const NETWORK = process.env.NETWORK?.trim().toLowerCase() || "local";
export const VERSION = pVersion(process.env.VERSION || DEV_VERSION);
export const NODE_VERSION_HASH = process.env.NODE_VERSION_HASH;

// URLs
export const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || networkToOrchestrator();
export const LOG_INGESTOR_URL = process.env.LOG_INGESTOR_URL || networkToIngestor();
export const IPFS_GATEWAY_ORIGIN = process.env.IPFS_GATEWAY_ORIGIN || "https://ipfs.io";

// Operator info
export const FIL_WALLET_ADDRESS = process.env.FIL_WALLET_ADDRESS || error("FIL_WALLET_ADDRESS");
export const NODE_OPERATOR_EMAIL = process.env.NODE_OPERATOR_EMAIL || error("NODE_OPERATOR_EMAIL");

// Extra
export const IS_CORE_L1 = process.env.IS_CORE_L1 === "true";
export const SPEEDTEST_SERVER_CONFIG = process.env.SPEEDTEST_SERVER_CONFIG || "";
export const LASSIE_ORIGIN = process.env.LASSIE_ORIGIN || null;
export const LASSIE_SP_ELIGIBLE_PORTION = spPortionFromString(process.env.LASSIE_SP_ELIGIBLE_PORTION || null);

export const NODE_UA = `Saturn/${VERSION}`;

export const ORCHESTRATOR_REGISTRATION = process.env.ORCHESTRATOR_REGISTRATION
  ? process.env.ORCHESTRATOR_REGISTRATION === "true"
  : true;

export let nodeToken = "";
export const updateNodeToken = (newToken) => {
  nodeToken = newToken;
};
export const hasNodeToken = () => Boolean(nodeToken);

function networkToOrchestrator() {
  switch (NETWORK) {
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
  switch (NETWORK) {
    case "main": {
      return "https://25y6y3tobkpa3thvn5wvu6kgsa0wzhdk.lambda-url.us-west-2.on.aws/";
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

function spPortionFromString(portion) {
  const portionAsFloat = parseFloat(portion);
  if (Number.isNaN(portionAsFloat)) {
    return 0.0;
  }
  return portionAsFloat;
}
