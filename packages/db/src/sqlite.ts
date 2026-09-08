import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "./schema.sqlite";
import { sqliteFilename } from "./options";

export function createSqliteDatabase(filename?: string) {
  const location = sqliteFilename(filename);
  if (location !== ":memory:")
    mkdirSync(dirname(location), { recursive: true });
  const client = new Database(location, { create: true, strict: true });
  client.exec(
    "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;",
  );
  const db = drizzle(client, { schema });
  return {
    provider: "sqlite" as const,
    db,
    schema,
    findUserByEmail: async (email: string) =>
      db.select().from(schema.user).where(eq(schema.user.email, email)).get(),
    findUsers: async () => db.select().from(schema.user).all(),
    setUserRole: async (id: string, role: "member" | "admin") => {
      db.update(schema.user).set({ role }).where(eq(schema.user.id, id)).run();
    },
    close: async () => {
      client.close();
    },
  };
}
