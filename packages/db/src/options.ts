import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export type DatabaseProvider = "sqlite" | "postgres";
export interface DatabaseOptions {
  provider: DatabaseProvider;
  url?: string;
  filename?: string;
}
export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
export function sqliteFilename(filename = ".local/hpc-cloud.sqlite") {
  return filename === ":memory:" ? filename : resolve(projectRoot, filename);
}
export function databaseOptions(environment: {
  DATABASE_PROVIDER?: string;
  DATABASE_URL?: string;
  SQLITE_PATH?: string;
  NODE_ENV?: string;
}): DatabaseOptions {
  const provider = environment.DATABASE_PROVIDER || "sqlite";
  if (provider !== "sqlite" && provider !== "postgres")
    throw new Error("DATABASE_PROVIDER must be sqlite or postgres");
  if (environment.NODE_ENV === "production" && provider !== "postgres")
    throw new Error("Production requires DATABASE_PROVIDER=postgres");
  if (provider === "postgres") {
    try {
      const url = new URL(environment.DATABASE_URL || "");
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname)
        throw new Error();
    } catch {
      throw new Error(
        "DATABASE_URL must be a PostgreSQL URL when DATABASE_PROVIDER=postgres",
      );
    }
  }
  return {
    provider,
    url: environment.DATABASE_URL,
    filename: environment.SQLITE_PATH || undefined,
  };
}
