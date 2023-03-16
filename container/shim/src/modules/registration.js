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
  ORCHESTRATOR_REGISTRATION,
  ORCHESTRATOR_URL,
  NETWORK,
  updateNodeToken,
} from "../config.js";
import { debug as Debug } from "../utils/logging.js";
import { getCPUStats, getDiskStats, getMemoryStats, getNICStats, getSpeedtest } from "../utils/system.js";
import { backupCertExists, CERT_PATH, certExists, getNewTLSCert, SSL_PATH, swapCerts } from "./tls.js";
import { parseVersionNumber } from "../utils/version.js";
import { orchestratorAgent } from "../utils/http.js";
import { prefillCache } from "../utils/prefill.js";
import { check } from "../lib/ocsp/check.js";

const debug = Debug.extend("registration");

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

let requirements;
export async function register(initial = false) {
  debug("Initiating registration (initial=%s)", initial);
  if (!requirements) {
    requirements = await fetchRequirements();
  }

  validateVersionNumber();

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
    verifyLinkRequirements(requirements, speedtest);
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
  if (!certExists || (!backupCertExists && NETWORK === "main")) {
    await handleMissingCert(registerOptions);
    return;
  }

  const certBuffer = await fsPromises.readFile(CERT_PATH);

  if (initial) {
    await checkCertValidity(certBuffer, registerOptions);
  }

  if (backupCertExists) {
    await checkCertOCSPStatus(certBuffer);
  }

  debug("Registering with orchestrator...");

  await sendRegisterRequest(initial, registerOptions);

  setTimeout(register, (NETWORK === "local" ? 1 : Math.random() * 5 + 5) * 60 * 1000);
}

async function fetchRequirements() {
  try {
    return await fetch(`${ORCHESTRATOR_URL}/requirements`, {
      agent: orchestratorAgent,
      headers: {
        "User-Agent": NODE_UA,
      },
    }).then((res) => res.json());
  } catch (err) {
    const error = new Error(`Failed to fetch requirements: ${err.name}`);
    debug(error.message);
    throw error;
  }
}

function validateVersionNumber() {
  const versionNumber = parseVersionNumber(NODE_VERSION);
  if (versionNumber < requirements.minVersion) {
    throw new Error(
      `Node version ${versionNumber} is too old. ` +
        `Minimum version: ${requirements.minVersion}. ` +
        "Please update your node and set up auto-update."
    );
  }
  if (versionNumber < (requirements.lastVersion || 0)) {
    debug(
      `Node version ${versionNumber} is not the latest. ` +
        `Latest version: ${requirements.lastVersion}. ` +
        "Please update your node and set up auto-update."
    );
  }
}

async function handleMissingCert(registerOptions) {
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
}

async function checkCertValidity(certBuffer, registerOptions) {
  const cert = new X509Certificate(certBuffer);
  const validTo = Date.parse(cert.validTo);
  const expiresSoon = Date.now() > validTo - FIVE_DAYS_MS;
  let valid = true;

  if (expiresSoon) {
    debug("Certificate is soon to expire, getting a new one...");
    valid = false;
  } else {
    debug(`Certificate is valid until ${cert.validTo}`);
  }

  if (cert.subjectAltName && !cert.subjectAltName.includes("l1s")) {
    debug("Certificate is missing l1s SAN, getting a new one...");
    valid = false;
  }

  if (!valid) {
    await getNewTLSCert(registerOptions);
    // we get the new cert and restart
    process.exit(1);
  }
}

async function checkCertOCSPStatus(certBuffer) {
  const certString = certBuffer.toString();
  const boundary = "-----END CERTIFICATE-----";
  const boundaryIndex = certString.indexOf(boundary);
  const cert = certString.substring(0, boundaryIndex + boundary.length);
  const caCert = certString.substring(boundaryIndex + boundary.length + 1);

  try {
    const response = await check(cert, caCert);
    if (response.type === "good") {
      debug("OCSP status of certificate is good");
    } else {
      debug("OCSP status of certificate is not good %o", response);
      await swapCerts();
      process.exit(1);
    }
  } catch (err) {
    debug(`Unable to verify OCSP status of certificate: ${err.name} ${err.message}`);
  }
}

async function sendRegisterRequest(initial, registerOptions) {
  try {
    const { token, ipGeo, error, success } = await fetch(`${ORCHESTRATOR_URL}/register?ssl=done`, registerOptions).then(
      (res) => res.json()
    );

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

let deregistering;
export async function deregister() {
  if (!ORCHESTRATOR_REGISTRATION) return;
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

  if (stats.memoryStats.totalMemoryKB / 1024 / 1024 < minMemoryGB) {
    throw new Error(
      `Not enough memory. Required: ${minMemoryGB} GB, available: ${(
        stats.memoryStats.totalMemoryKB /
        1024 /
        1024
      ).toFixed()}`
    );
  }

  if (stats.diskStats.totalDiskMB / 1000 < minDiskGB) {
    throw new Error(
      `Not enough disk space. Required: ${minDiskGB} GB, available: ${(stats.diskStats.totalDiskMB / 1000).toFixed()}`
    );
  }

  debug("All requirements met");
}

function verifyLinkRequirements(requirements, speedtest) {
  if (!speedtest) {
    throw new Error("No speedtest result");
  }

  if (speedtest.upload.bandwidth < (requirements.minUploadSpeedMbps * 1_000_000) / 8) {
    throw new Error(
      `Not enough upload speed. Required: ${requirements.minUploadSpeedMbps} Mbps, current: ${
        (speedtest.upload.bandwidth / 1_000_000) * 8
      } Mbps`
    );
  }

  if (speedtest.download.bandwidth < (requirements.minDownloadSpeedMbps * 1_000_000) / 8) {
    throw new Error(
      `Not enough download speed. Required: ${requirements.minDownloadSpeedMbps} Mbps, current: ${
        (speedtest.download.bandwidth / 1_000_000) * 8
      } Mbps`
    );
  }

  debug("Speeds requirements met");
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
