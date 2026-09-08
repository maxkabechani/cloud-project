import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import type { DatabaseOptions } from "./options";
export { databaseOptions, sqliteFilename } from "./options";
export type { DatabaseOptions, DatabaseProvider } from "./options";

export async function createDatabase(options: DatabaseOptions) {
  if (options.provider === "sqlite") {
    // Keep the Bun-specific driver out of the PostgreSQL runtime path.
    const { createSqliteDatabase } = await import("./sqlite");
    return createSqliteDatabase(options.filename);
  }
  if (!options.url) throw new Error("DATABASE_URL is required for PostgreSQL");
  const client = postgres(options.url, { max: 10, connect_timeout: 10 });
  const db = drizzle(client, { schema });
  return {
    provider: "postgres" as const,
    db,
    schema,
    findUserByEmail: async (email: string) => {
      const [user] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.email, email));
      return user;
    },
    findUsers: async () => db.select().from(schema.user),
    setUserRole: async (id: string, role: "member" | "admin") => {
      await db.update(schema.user).set({ role }).where(eq(schema.user.id, id));
    },
    close: () => client.end(),
  };
}
export type DatabaseConnection = Awaited<ReturnType<typeof createDatabase>>;
