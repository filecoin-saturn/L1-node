import { ORCHESTRATOR_URL } from "../config.js";
import https from "node:https";
import http from "node:http";

const agentOpts = {
  keepAlive: true,
};

export const orchestratorAgent = ORCHESTRATOR_URL.includes("https")
  ? new https.Agent(agentOpts)
  : new http.Agent(agentOpts);
