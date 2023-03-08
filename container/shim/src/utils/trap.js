import { debug as Debug } from "./logging.js";
import { deregister } from "../modules/registration.js";
import startLogIngestor from "../modules/log_ingestor.js";

const debug = Debug.extend("trap");

const shutdownServer = (server, signal) => async () => {
  debug(`Shutting down server with signal ${signal}`);
  server.closeIdleConnections();
  server.close(async () => {
    debug("Server closed");
    await startLogIngestor();
    process.exit(0);
  });
};

const drainServer = (server) => () => {
  debug("Draining server");
  deregister();
};

export const trapServer = (server) => {
  process.on("SIGQUIT", shutdownServer(server, "SIGQUIT"));
  process.on("SIGINT", shutdownServer(server, "SIGINT"));
  process.on("SIGTERM", drainServer(server));
};
