import { createAgentApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = createAgentApp(config);
await app.listen({ host: config.CLUSTER_AGENT_HOST, port: config.CLUSTER_AGENT_PORT });
