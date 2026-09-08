import { fileURLToPath } from "node:url";
import type { DatabaseConnection } from "./index";
export async function migrateDatabase(database: DatabaseConnection) {
  if (database.provider === "sqlite") {
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    migrate(database.db, {
      migrationsFolder: fileURLToPath(
        new URL("../migrations-sqlite", import.meta.url),
      ),
    });
  } else {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(
        new URL("../migrations", import.meta.url),
      ),
    });
  }
}
