import { createAgentApp } from "./app";
import { loadConfig } from "./config";
import { OpenNebulaAgentProvider } from "./providers/opennebula/provider";
import { MockAgentProvider } from "./provider";

const config = loadConfig();
const hasOpenNebula = Boolean(config.OPENNEBULA_ENDPOINT && config.OPENNEBULA_USERNAME && config.OPENNEBULA_PASSWORD);
const provider = hasOpenNebula ? new OpenNebulaAgentProvider({ endpoint: config.OPENNEBULA_ENDPOINT!, username: config.OPENNEBULA_USERNAME!, password: config.OPENNEBULA_PASSWORD! }) : new MockAgentProvider();
const app = createAgentApp(config, provider);
await app.listen({ host: config.CLUSTER_AGENT_HOST, port: config.CLUSTER_AGENT_PORT });
