import { z } from "zod";
import { databaseOptions } from "@hpc/db";

const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());
const optionalSecret = z.preprocess((value) => value === "" ? undefined : value, z.string().min(32).optional());

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_PROVIDER: z.enum(["sqlite", "postgres"]).default("sqlite"),
  DATABASE_URL: z.string().optional(),
  SQLITE_PATH: z.string().optional(),
  CLOUD_PROVIDER: z.enum(["mock", "opennebula"]).default("mock"),
  CLUSTER_AGENT_URL: optionalUrl,
  CLUSTER_AGENT_API_KEY: optionalSecret,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_URL: z.url(),
});

export function readConfig(environment: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(environment);
  // Never serialize invalid environment values: they may contain secrets.
  if (!result.success)
    throw new Error(
      `Invalid environment: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const config = result.data;
  if (
    config.NODE_ENV === "production" &&
    [config.BETTER_AUTH_URL, config.WEB_URL].some(
      (url) => !url.startsWith("https://"),
    )
  ) {
    throw new Error(
      "Production authentication and frontend URLs must use HTTPS",
    );
  }
  databaseOptions(config);
  if (config.CLOUD_PROVIDER === "opennebula" && (!config.CLUSTER_AGENT_URL || !config.CLUSTER_AGENT_API_KEY)) {
    throw new Error("OpenNebula provider requires CLUSTER_AGENT_URL and CLUSTER_AGENT_API_KEY");
  }
  return config;
}
export type Config = ReturnType<typeof readConfig>;
