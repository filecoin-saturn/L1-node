import startLogIngestor from "../modules/log_ingestor.js";
import { deregister } from "../modules/registration.js";
import { debug as Debug } from "./logging.js";

const debug = Debug.extend("trap");

const shutdownServer = (server, signal) => () => {
  debug(`Shutting down server with signal ${signal}`);
  server.closeIdleConnections();
  server.close(async () => {
    debug("Server closed");
    await Promise.allSettled([startLogIngestor(), deregister()]);
    process.exit(0);
  });
};

const drainServer = () => {
  debug("Draining server");
  deregister();
};

export const trapServer = (server) => {
  process.on("SIGQUIT", shutdownServer(server, "SIGQUIT"));
  process.on("SIGINT", shutdownServer(server, "SIGINT"));
  process.on("SIGTERM", drainServer);
};
