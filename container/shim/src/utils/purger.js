import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { debug } from "./logging.js";

const CACHE_DIR = "/usr/src/app/shared/nginx_cache";

export async function purgeCacheFile(key) {
  debug("Purging cache file for key %s", key);
  const cacheFilePath = keyToCacheFilePath(key);
  await fs
    .unlink(path.join(CACHE_DIR, cacheFilePath))
    .catch((err) => debug("Failed to purge cache file: %s", err.message));
}

function keyToCacheFilePath(path) {
  const hash = createHash("md5").update(path).digest("hex");

  return `${hash.slice(-2)}/${hash.slice(-4, -2)}/${hash.slice(-6, -4)}/${hash}`;
}
