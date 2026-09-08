import { z } from "zod";

const configSchema = z.object({
  CLUSTER_AGENT_API_KEY: z.string().min(32),
  CLUSTER_AGENT_HOST: z.string().default("127.0.0.1"),
  CLUSTER_AGENT_PORT: z.coerce.number().int().positive().default(4001),
  OPENNEBULA_ENDPOINT: z.string().url().optional(),
  OPENNEBULA_USERNAME: z.string().optional(),
  OPENNEBULA_PASSWORD: z.string().optional(),
});

export type AgentConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid cluster-agent configuration: ${parsed.error.message}`);
  return parsed.data;
}
