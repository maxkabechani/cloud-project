import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDatabase,
  databaseOptions,
  sqliteFilename,
  type DatabaseConnection,
} from "@hpc/db";
import { migrateDatabase } from "@hpc/db/migrations";
import { getTableColumns } from "drizzle-orm";
import * as pgSchema from "@hpc/db/schema";
import * as sqliteSchema from "@hpc/db/schema/sqlite";
import { createAuth } from "../apps/api/src/auth";
import { createApp } from "../apps/api/src/app";
import { createCloudService } from "../apps/api/src/cloud";
import { readConfig } from "../apps/api/src/config";

const config = readConfig({
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: "sqlite-test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:4000",
  WEB_URL: "http://localhost:3000",
});
let directory: string;
let filename: string;
let database: DatabaseConnection;
let app: Awaited<ReturnType<typeof createApp>>;
let cookie = "";
const headers = { origin: config.WEB_URL, "x-hpc-client-ip": "203.0.113.200" };
const credentials = {
  name: "SQLite Member",
  email: "sqlite@example.test",
  password: "sqlite-test-password-only",
};
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "hpc-sqlite-"));
  filename = join(directory, "test.sqlite");
  database = await createDatabase({ provider: "sqlite", filename });
  await migrateDatabase(database);
  app = await createApp(config, createAuth(database.db, config), createCloudService(async () => []), async () => []);
});
afterAll(async () => {
  await app?.close();
  await database?.close();
  // Finalize unreferenced prepared statements before Windows removes the temp file.
  Bun.gc(true);
  // Only remove files inside the newly allocated test directory, never user data.
  if (directory) {
    for (const file of await readdir(directory))
      await unlink(join(directory, file));
    await rmdir(directory);
  }
});
describe("SQLite authentication and persistence", () => {
  test("defaults to SQLite without a PostgreSQL URL", () => {
    expect(config.DATABASE_PROVIDER).toBe("sqlite");
    expect(databaseOptions({})).toEqual({
      provider: "sqlite",
      url: undefined,
      filename: undefined,
    });
  });
  test("migration can run repeatedly without data loss", async () => {
    await migrateDatabase(database);
    expect((await app.inject("/api/me")).statusCode).toBe(401);
  });
  test("validates registration and rejects admin injection", async () => {
    expect(
      (
        await app.inject({
          remoteAddress: "198.51.100.20",
          method: "POST",
          url: "/api/auth/sign-up/email",
          headers,
          payload: { ...credentials, password: "short" },
        })
      ).statusCode,
    ).toBe(400);
    const response = await app.inject({
      remoteAddress: "198.51.100.20",
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers,
      payload: { ...credentials, role: "admin" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe("member");
    cookie = response.cookies
      .map((c) => c.name + "=" + encodeURIComponent(c.value))
      .join("; ");
  });
  test("returns correct profile dates and boolean mappings", async () => {
    const response = await app.inject({
      remoteAddress: "198.51.100.20",
      url: "/api/me",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(Number.isNaN(Date.parse(response.json().user.createdAt))).toBe(
      false,
    );
    const user = await database.findUserByEmail(credentials.email);
    expect(user?.emailVerified).toBe(false);
    expect(user?.createdAt).toBeInstanceOf(Date);
  });
  test("uses the transport IP instead of a forged client header", () => {
    if (database.provider !== "sqlite") throw new Error("Expected SQLite");
    const [session] = database.db.select().from(sqliteSchema.session).all();
    expect(session.ipAddress).toBe("198.51.100.20");
  });
  test("enforces profile role and origin protections", async () => {
    await app.inject({
      remoteAddress: "198.51.100.20",
      method: "POST",
      url: "/api/auth/update-user",
      headers: { ...headers, cookie },
      payload: { role: "admin" },
    });
    expect((await database.findUserByEmail(credentials.email))?.role).toBe(
      "member",
    );
    expect(
      (
        await app.inject({
          remoteAddress: "198.51.100.20",
          method: "POST",
          url: "/api/auth/sign-out",
          headers: { origin: "https://untrusted.example", cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  test("persists account and session across close/reopen", async () => {
    await app.close();
    await database.close();
    database = await createDatabase({ provider: "sqlite", filename });
    await migrateDatabase(database);
    app = await createApp(config, createAuth(database.db, config), createCloudService(async () => []), async () => []);
    const response = await app.inject({
      remoteAddress: "198.51.100.20",
      url: "/api/me",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(credentials.email);
  });
  test("logout revokes a session and credentials permit a fresh login", async () => {
    expect(
      (
        await app.inject({
          remoteAddress: "198.51.100.20",
          method: "POST",
          url: "/api/auth/sign-out",
          headers: { ...headers, cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          remoteAddress: "198.51.100.20",
          url: "/api/me",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          remoteAddress: "198.51.100.20",
          method: "POST",
          url: "/api/auth/sign-in/email",
          headers,
          payload: { email: credentials.email, password: "incorrect-password" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          remoteAddress: "198.51.100.20",
          method: "POST",
          url: "/api/auth/sign-in/email",
          headers,
          payload: credentials,
        })
      ).statusCode,
    ).toBe(200);
  });
  test("server-side admin seeding can update roles", async () => {
    const user = await database.findUserByEmail(credentials.email);
    expect(user).toBeDefined();
    await database.setUserRole(user!.id, "admin");
    expect((await database.findUserByEmail(credentials.email))?.role).toBe(
      "admin",
    );
  });
});
describe("database configuration boundaries", () => {
  test("rejects a PostgreSQL selection without a valid URL", () => {
    expect(() => databaseOptions({ DATABASE_PROVIDER: "postgres" })).toThrow(
      "DATABASE_URL",
    );
    expect(() =>
      databaseOptions({
        DATABASE_PROVIDER: "postgres",
        DATABASE_URL: "sqlite:test",
      }),
    ).toThrow("DATABASE_URL");
  });
  test("selects PostgreSQL when configured", () => {
    expect(
      databaseOptions({
        DATABASE_PROVIDER: "postgres",
        DATABASE_URL: "postgresql://test:test@localhost/test",
      }).provider,
    ).toBe("postgres");
  });
  test("rejects SQLite for the planned production deployment", () => {
    expect(() => databaseOptions({ NODE_ENV: "production" })).toThrow(
      "Production requires",
    );
  });
  test("uses one project-relative SQLite path independent of current directory", () => {
    expect(sqliteFilename()).toBe(sqliteFilename(".local/hpc-cloud.sqlite"));
    expect(sqliteFilename()).toMatch(/hpc-cloud.sqlite$/);
  });
  test("keeps both dialects aligned on auth fields", () => {
    for (const table of ["user", "session", "account", "verification"] as const)
      expect(Object.keys(getTableColumns(pgSchema[table])).sort()).toEqual(
        Object.keys(getTableColumns(sqliteSchema[table])).sort(),
      );
  });
});
