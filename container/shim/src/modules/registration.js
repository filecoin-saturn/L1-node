import { X509Certificate } from "node:crypto";
import fsPromises from "node:fs/promises";
import fetch from "node-fetch";

import {
  DEV_VERSION,
  FIL_WALLET_ADDRESS,
  NODE_OPERATOR_EMAIL,
  NODE_UA,
  NODE_VERSION,
  nodeId,
  ORCHESTRATOR_URL,
  SATURN_NETWORK,
  updateNodeToken,
} from "../config.js";
import { debug as Debug } from "../utils/logging.js";
import { getCPUStats, getDiskStats, getMemoryStats, getNICStats, getSpeedtest } from "../utils/system.js";
import { CERT_PATH, certExists, getNewTLSCert, SSL_PATH } from "./tls.js";
import { parseVersionNumber } from "../utils/version.js";
import { orchestratorAgent } from "../utils/http.js";
import { prefillCache } from "../utils/prefill.js";

const debug = Debug.extend("registration");

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

let requirements;
export async function register(initial = false) {
  debug("Initiating registration (initial=%s)", initial);
  try {
    requirements = await fetch(`${ORCHESTRATOR_URL}/requirements`, {
      agent: orchestratorAgent,
      headers: {
        "User-Agent": NODE_UA,
      },
    }).then((res) => res.json());
  } catch (err) {
    const error = new Error(`Failed to fetch requirements: ${err.name}`);
    debug(error.message);
    if (initial) {
      throw error;
    }
  }

  const versionNumber = parseVersionNumber(NODE_VERSION);
  if (versionNumber < requirements.minVersion) {
    throw new Error(
      `Node version ${versionNumber} is too old. Minimum version: ${requirements.minVersion}. Please update your node and set up auto-update.`
    );
  }
  if (versionNumber < (requirements.lastVersion || 0)) {
    debug(
      `Node version ${versionNumber} is not the latest. Latest version: ${requirements.lastVersion}. Please update your node and set up auto-update.`
    );
  }

  const stats = {
    memoryStats: await getMemoryStats(),
    diskStats: await getDiskStats(),
    cpuStats: await getCPUStats(),
    nicStats: await getNICStats(),
  };

  verifyHWRequirements(requirements, stats);

  if (NODE_VERSION !== DEV_VERSION && initial) {
    let speedtest;
    try {
      speedtest = await getSpeedtest();
    } catch (err) {
      const error = new Error(`Error while performing speedtest: ${err.name} ${err.message}`);
      debug(error.message);
      throw error;
    }
    verifyUplinkRequirements(requirements.minUploadSpeedMbps, speedtest);
    Object.assign(stats, { speedtest });
  }

  const body = {
    nodeId,
    level: 1,
    initial,
    version: NODE_VERSION,
    filWalletAddress: FIL_WALLET_ADDRESS,
    operatorEmail: NODE_OPERATOR_EMAIL,
    ...stats,
  };

  const registerOptions = postOptions(body);

  // If cert is not yet in the volume, register
  if (!certExists) {
    if (!(await fsPromises.stat(SSL_PATH).catch((_) => false))) {
      debug("Creating SSL folder");
      await fsPromises.mkdir(SSL_PATH, { recursive: true });
    }

    debug(
      "Registering with orchestrator for the first time, requesting new TLS cert with the following config (this could take up to 20 mins)"
    );
    try {
      await getNewTLSCert(registerOptions);

      debug("Success, restarting container...");

      process.exit(1);
    } catch (err) {
      debug(`Failed initial registration: ${err.name} ${err.message}`);
      // we don't restart if we failed the initial registration
      process.exit(0);
    }
  } else {
    if (initial) {
      const certBuffer = await fsPromises.readFile(CERT_PATH);

      const cert = new X509Certificate(certBuffer);

      let valid = true;

      const validTo = Date.parse(cert.validTo);

      if (Date.now() > validTo - FIVE_DAYS_MS) {
        debug("Certificate is soon to expire, getting a new one...");
        valid = false;
      } else {
        debug(`Certificate is valid until ${cert.validTo}`);
      }

      if (!valid) {
        await getNewTLSCert(registerOptions);
        // we get the new cert and restart
        process.exit(1);
      }
    }

    debug("Registering with orchestrator...");

    try {
      const { token, ipGeo, error, success } = await fetch(
        `${ORCHESTRATOR_URL}/register?ssl=done`,
        registerOptions
      ).then((res) => res.json());

      if (!success) {
        debug(error);
        throw new Error(error);
      }

      if (ipGeo) {
        debug(
          `Node's geolocation is set to ${ipGeo.city}, ${ipGeo.region}, ${ipGeo.country}. ` +
            "If this is wrong, please open an issue at https://github.com/filecoin-saturn/L1-node/issues"
        );
      }

      updateNodeToken(token);

      debug("Successful registration, updated token");

      if (initial) prefillCache();
    } catch (err) {
      debug("Failed registration %s", err.message);
      if (initial) {
        // we don't try again if we fail the initial registration
        process.exit(0);
      }
    }
  }
  setTimeout(register, (SATURN_NETWORK === "local" ? 1 : Math.random() * 9 + 1) * 60 * 1000);
}

let deregistering;
export async function deregister() {
  if (!deregistering) deregistering = _deregister();
  return deregistering;
}

async function _deregister() {
  debug("De-registering from orchestrator");
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10_000);

  try {
    await fetch(`${ORCHESTRATOR_URL}/deregister`, {
      ...postOptions({ nodeId }),
      signal: controller.signal,
    });
    debug("De-registration successful");
  } catch (err) {
    debug("Failed de-registration");
  } finally {
    clearTimeout(timeout);
    deregistering = null;
  }
}

export const addRegisterCheckRoute = (app) =>
  app.get("/register-check", (req, res) => {
    const ip = req.ip.replace("::ffff:", "");
    const { nodeId: receivedNodeId } = req.query;
    if (receivedNodeId !== nodeId) {
      debug.extend("check")(`Check failed, nodeId mismatch. Received: ${receivedNodeId} from IP ${ip}`);
      return res.sendStatus(403);
    }
    debug.extend("check")("Successful");
    res.sendStatus(200);
  });

function verifyHWRequirements(requirements, stats) {
  const { minCPUCores, minMemoryGB, minDiskGB } = requirements;

  if (stats.cpuStats.numCPUs < minCPUCores) {
    throw new Error(`Not enough CPU cores. Required: ${minCPUCores}, current: ${stats.cpuStats.numCPUs}`);
  }

  if (stats.memoryStats.totalMemory < minMemoryGB) {
    throw new Error(`Not enough memory. Required: ${minMemoryGB} GB, available: ${stats.memoryStats.totalMemory}`);
  }

  if (stats.diskStats.totalDisk < minDiskGB) {
    throw new Error(`Not enough disk space. Required: ${minDiskGB} GB, available: ${stats.diskStats.totalDisk}`);
  }

  debug("All requirements met");
}

function verifyUplinkRequirements(minUploadSpeedMbps, speedtest) {
  if (!speedtest || speedtest?.upload.bandwidth < (minUploadSpeedMbps * 1_000_000) / 8) {
    throw new Error(
      `Not enough upload speed. Required: ${minUploadSpeedMbps} Mbps, current: ${
        (speedtest.upload.bandwidth / 1_000_000) * 8
      } Mbps`
    );
  }

  debug("Speed requirement met");
}

function postOptions(body) {
  return {
    agent: orchestratorAgent,
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": NODE_UA,
    },
  };
}
