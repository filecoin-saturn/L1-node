import http from "node:http";
import { validateAddressString } from "@glif/filecoin-address";

import app from "../index.js";
import { register } from "../modules/registration.js";
import {
  FIL_WALLET_ADDRESS,
  NODE_OPERATOR_EMAIL,
  VERSION,
  NODE_ID,
  PORT,
  ORCHESTRATOR_REGISTRATION,
  NETWORK,
} from "../config.js";
import { trapServer } from "../utils/trap.js";
import { debug } from "../utils/logging.js";
import startLogIngestor from "../modules/log_ingestor.js";
import { refreshLocalNodes } from "../modules/local_nodes.js";

debug("Saturn L1 Node");
debug.extend("id")(NODE_ID);
debug.extend("version")(VERSION);

if (!validateAddressString(FIL_WALLET_ADDRESS)) throw new Error("Invalid wallet address");
if (!FIL_WALLET_ADDRESS.startsWith("f") && NETWORK === "main") {
  throw new Error("Invalid testnet wallet address for Saturn Main Network");
}

debug.extend("important")("===== IMPORTANT =====");
debug.extend("important")(`Earnings will be sent to Filecoin wallet address: ${FIL_WALLET_ADDRESS}`);
debug.extend("important")(`Payment notifications and important updates will be sent to: ${NODE_OPERATOR_EMAIL}`);
debug.extend("important")("===== IMPORTANT =====");

setTimeout(async function () {
  if (ORCHESTRATOR_REGISTRATION) {
    await register(true).catch((err) => {
      debug(`Failed to register ${err.name} ${err.message}`);
      // we don't try again if we fail the initial registration
      process.exit(0);
    });
  }

  // run log ingestor process in background (starts immediately and keeps running periodically)
  startLogIngestor();

  refreshLocalNodes();
}, 500);

const server = http.createServer(app);
server.listen(PORT, "0.0.0.0", async () => {
  debug.extend("server")("shim process running");
});

server.keepAliveTimeout = 60 * 60 * 1000;

trapServer(server);
