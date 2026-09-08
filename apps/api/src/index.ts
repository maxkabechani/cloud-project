import { createDatabase, databaseOptions } from "@hpc/db";
import { readConfig } from "./config";
import { createAuth } from "./auth";
import { createApp } from "./app";
import { createCloudService } from "./cloud";
const config = readConfig(process.env);
const database = await createDatabase(databaseOptions(config));
const listUsers = async () => (await database.findUsers()).map((member) => ({ id: member.id, name: member.name, email: member.email, role: member.role as "member" | "admin", createdAt: new Date(member.createdAt).toISOString() }));
const app = await createApp(config, createAuth(database.db, config), createCloudService(listUsers, { provider: config.CLOUD_PROVIDER, agentUrl: config.CLUSTER_AGENT_URL, agentApiKey: config.CLUSTER_AGENT_API_KEY, demoData: config.DEMO_DATA === "true" }), listUsers);
app.addHook("onClose", () => database.close());
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ host: config.HOST, port: config.PORT });
