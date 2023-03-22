import { loadavg, cpus } from "node:os";
import fsPromises from "node:fs/promises";
import { debug as Debug } from "./logging.js";
import { promisify } from "node:util";
import { exec as CpExec } from "node:child_process";
import prettyBytes from "pretty-bytes";
import { SPEEDTEST_SERVER_CONFIG } from "../config.js";

const exec = promisify(CpExec);

const debug = Debug.extend("system");

const meminfoKBToGB = (bytes) => (bytes / 1024 / 1024).toFixed();

export async function getMemoryStats() {
  const result = await fsPromises.readFile("/proc/meminfo", "utf-8");
  const values = result
    .trim()
    .split("\n")
    .slice(0, 3)
    .map((res) => res.split(":").map((kv) => kv.trim()))
    .reduce((acc, cv) => {
      return Object.assign(acc, {
        [cv[0]]: Number(cv[1].split(" ")[0]),
      });
    }, {});
  debug(
    `Memory Total: ${meminfoKBToGB(values.MemTotal)} GB Free: ${meminfoKBToGB(
      values.MemFree
    )} GB Available: ${meminfoKBToGB(values.MemAvailable)} GB`
  );
  return {
    totalMemoryKB: values.MemTotal,
    freeMemoryKB: values.MemFree,
    availableMemoryKB: values.MemAvailable,
    raw: result,
  };
}

export async function getDiskStats() {
  const { stdout: resultMB } = await exec("df -B MB /usr/src/app/shared");
  const valuesMB = resultMB
    .trim()
    .split("\n")[1]
    .split(/\s+/)
    .map((res) => Number(res.replace("MB", "")));
  const totalDiskMB = valuesMB[1];
  const usedDiskMB = valuesMB[2];
  const availableDiskMB = valuesMB[3];
  debug(`Disk Total: ${totalDiskMB / 1000} GB Used: ${usedDiskMB / 1000} GB Available: ${availableDiskMB / 1000} MB`);
  return {
    totalDiskMB,
    usedDiskMB,
    availableDiskMB,
    raw: resultMB,
  };
}

export async function getCPUStats() {
  const { stdout: result } = await exec("lscpu");
  const numCPUs = cpus().length;
  const loadAvgs = loadavg();
  debug(`CPUs: ${numCPUs} (${loadAvgs.join(", ")})`);
  return { numCPUs, loadAvgs, raw: result };
}

export async function getNICStats() {
  const { stdout: result } = await exec("cat /proc/net/dev");
  const nicStats = result
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .map((nic) => {
      const [parsedName, ...values] = nic;
      const nicName = parsedName.replace(":", "");
      if (
        isNaN(Number(values[0])) ||
        isNaN(Number(values[1])) ||
        ["lo", "docker0"].includes(nicName) ||
        nicName.endsWith("nl0")
      ) {
        return false;
      }
      return {
        interface: nicName,
        bytesReceived: Number(values[0]),
        bytesSent: Number(values[8]),
        packetsReceived: Number(values[1]),
        packetsSent: Number(values[9]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.packetsSent - a.packetsSent)[0];
  debug(
    `NIC ${nicStats.interface}: ${prettyBytes(nicStats.bytesReceived)} downloaded / ${prettyBytes(
      nicStats.bytesSent
    )} uploaded`
  );
  return nicStats;
}

export async function getSpeedtest() {
  debug("Executing speedtest");
  const { stdout: result } = await exec(`speedtest --server-id ${SPEEDTEST_SERVER_CONFIG} --accept-license --accept-gdpr -f json`);
  const values = JSON.parse(result);
  debug(
    `Done executing speedtest. ${bytesToMbps(values.download.bandwidth)} Mbps DL / ${bytesToMbps(
      values.upload.bandwidth
    )} Mbps  UL`
  );
  return values;
}

function bytesToMbps(bytes) {
  return (bytes / 1000 / 1000) * 8;
}
