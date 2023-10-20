import { X509Certificate } from "node:crypto";
import fsPromises from "node:fs/promises";
import fetch from "node-fetch";
import {
  DEV_VERSION,
  FIL_WALLET_ADDRESS,
  NETWORK,
  NETWORK_LEVEL,
  NODE_ID,
  NODE_OPERATOR_EMAIL,
  NODE_UA,
  NODE_VERSION_HASH,
  ORCHESTRATOR_REGISTRATION,
  ORCHESTRATOR_URL,
  updateNodeToken,
  VERSION,
} from "../config.js";
import { check } from "../lib/ocsp/check.js";
import { orchestratorAgent } from "../utils/http.js";
import { debug as Debug } from "../utils/logging.js";
import { prefillCache } from "../utils/prefill.js";
import { purgeCacheFile } from "../utils/purger.js";
import { getBootId, getCPUStats, getDiskStats, getMemoryStats, getNICStats, getSpeedtest } from "../utils/system.js";
import { parseVersionNumber } from "../utils/version.js";
import { backupCertExists, CERT_PATH, certExists, getNewTLSCert, SSL_PATH, swapCerts } from "./tls.js";

const debug = Debug.extend("registration");

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

let requirements;
let lastInitialRegistration = 0;
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

  let preregisterResponse;
  if (initial) {
    preregisterResponse = await sendPreRegisterRequest(
      postOptions({ nodeId: NODE_ID, level: NETWORK_LEVEL, version: VERSION })
    );
  }

  if (preregisterResponse?.filesToPurge) {
    debug("Purging %d files", preregisterResponse.filesToPurge.length);
    for (const file of preregisterResponse.filesToPurge) {
      await purgeCacheFile(file);
    }
  }

  if (VERSION !== DEV_VERSION && initial && preregisterResponse?.speedtestRequired !== false) {
    let speedtest;
    try {
      speedtest = await getSpeedtest();
    } catch (err) {
      const error = new Error(`Error while performing speedtest: ${err.name} ${err.message}`);
      debug(error.message);
      throw error;
    }
    verifyLinkRequirements(requirements, speedtest);
    verifySpeedtestRequirements(speedtest);
    Object.assign(stats, { speedtest });
  }

  const body = {
    nodeId: NODE_ID,
    nodeVersionHash: NODE_VERSION_HASH,
    level: NETWORK_LEVEL,
    version: VERSION,
    filWalletAddress: FIL_WALLET_ADDRESS,
    operatorEmail: NODE_OPERATOR_EMAIL,
    bootId: await getBootId(),
    initial,
    ...stats,
  };

  const registerOptions = postOptions(body);

  // If cert is not yet in the volume, register
  if (!certExists || (!backupCertExists && NETWORK === "main")) {
    debug("First time registering or missing cert");
    await handleMissingCert(registerOptions);
    return;
  }

  const certBuffer = await fsPromises.readFile(CERT_PATH);

  // Check cert validity on initial registration and at least twice daily
  if (initial || lastInitialRegistration < Date.now() - 12 * 60 * 60 * 1000) {
    await checkCertValidity(certBuffer, registerOptions, preregisterResponse);
  }

  if (backupCertExists) {
    await checkCertOCSPStatus(certBuffer);
  }

  debug("Registering with orchestrator...");

  await sendRegisterRequest(initial, registerOptions);

  if (initial) {
    lastInitialRegistration = Date.now();
  }

  setTimeout(register, Math.ceil((NETWORK === "local" ? 1 : Math.random() * 4 + 6) * 60 * 1000));
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
  const versionNumber = parseVersionNumber(VERSION);
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

async function checkCertValidity(certBuffer, registerOptions, preregisterResponse) {
  const cert = new X509Certificate(certBuffer);
  const validTo = Date.parse(cert.validTo);
  let valid = true;
  let soft = false;

  if (Date.now() > validTo) {
    debug("Certificate expired, getting a new one...");
    valid = false;
  } else if (Date.now() > validTo - FIVE_DAYS_MS) {
    debug("Certificate is soon to expire, getting a new one...");
    valid = false;
    soft = true;
  } else {
    debug(`Certificate is valid until ${cert.validTo}`);
  }

  if (NETWORK === "main" && cert.subjectAltName && !cert.subjectAltName.includes("l1s.saturn.ms")) {
    debug("Certificate is missing l1s.saturn.ms SAN, getting a new one...");
    valid = false;
  }

  if (NETWORK === "main" && cert.subjectAltName && Math.random() < 20 / 100) {
    const subdomain = preregisterResponse?.ip?.replace(/\./g, "-");
    const targetSAN = subdomain ? `${subdomain}.l1s.saturn.ms` : ".l1s.saturn.ms";

    if (!cert.subjectAltName.includes(targetSAN)) {
      debug(`Certificate is missing ${targetSAN} unique SAN, getting a new one...`);
      valid = false;
    }
  }

  if (NETWORK === "test" && cert.subjectAltName && !cert.subjectAltName.includes("l1s.saturn-test.ms")) {
    debug("Certificate is missing l1s.saturn-test.ms SAN, getting a new one...");
    valid = false;
  }

  if (!valid) {
    try {
      await getNewTLSCert(registerOptions);
      // we get the new cert and restart
      process.exit(1);
    } catch (e) {
      if (!soft) {
        throw e;
      }
      debug("Failed to get a new certificate, but we can still continue with the old one");
    }
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
    debug("Failed registration: %s", err.message);
    if (initial) {
      // we don't try again if we fail the initial registration
      process.exit(0);
    }
  }
}

/**
 * Sends a pre-registration request to the orchestrator.
 *
 * @typedef {object} PreRegisterResponse
 * @property {boolean} speedtestRequired
 * @property {string[]} filesToPurge
 *
 * @param {object} postOptions
 * @returns {Promise<PreRegisterResponse>}
 */
async function sendPreRegisterRequest(postOptions) {
  debug("Pre-registering with orchestrator");

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/pre-register`, postOptions);

    if (!res.ok) {
      throw new Error(await res.text());
    }

    debug("Successful pre-registration");

    return await res.json();
  } catch (err) {
    debug("Failed pre-registration: %s", err.message);
    // we don't try again if we fail the pre-registration
    process.exit(0);
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
      ...postOptions({ nodeId: NODE_ID }),
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
    if (receivedNodeId !== NODE_ID) {
      debug.extend("check")(`Check failed, node ID mismatch. Received: ${receivedNodeId} from IP ${ip}`);
      return res.sendStatus(403);
    }
    debug.extend("check")("Check successful, registration process continues...");
    res.sendStatus(204);
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

function verifySpeedtestRequirements(speedtest) {
  if (speedtest.ping.latency > 200) {
    throw new Error(`Ping too high. Required: < 200ms, current: ${speedtest.ping.latency}ms, select another server`);
  }
  if (speedtest.interface.externalIp.startsWith("10.") || speedtest.interface.externalIp.startsWith("192.168.")) {
    throw new Error(`Invalid external IP: ${speedtest.interface.externalIp}`);
  }

  debug("Speedtest verification met");
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
