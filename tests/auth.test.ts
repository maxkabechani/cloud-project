import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdir, readFile } from "node:fs/promises";
import { createAuth } from "../apps/api/src/auth";
import { createApp } from "../apps/api/src/app";
import { createCloudService } from "../apps/api/src/cloud";
import { readConfig } from "../apps/api/src/config";
import * as schema from "@hpc/db/schema";

const config = readConfig({
  NODE_ENV: "test",
  DATABASE_PROVIDER: "postgres",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-thirty-two-characters",
  BETTER_AUTH_URL: "http://localhost:4000",
  WEB_URL: "http://localhost:3000",
});
const database = new PGlite();
const db = drizzle(database, { schema });
const listUsers = async () => (await db.select().from(schema.user)).map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt.toISOString() as string }));
const app = await createApp(config, createAuth(db, config), createCloudService(listUsers), listUsers);
const headers = { origin: config.WEB_URL, "content-type": "application/json" };
const credentials = {
  name: "Max Researcher",
  email: "max@example.test",
  password: "test-only-long-password",
};
let cookie = "";
beforeAll(async () => {
  const folder = new URL("../packages/db/migrations/", import.meta.url);
  for (const file of (await readdir(folder))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await database.exec(await readFile(new URL(file, folder), "utf8"));
}, 30000);
afterAll(async () => {
  await app.close();
  await database.close();
});

describe("Better Auth through Fastify and PostgreSQL", () => {
  test("health does not require a cluster or session", async () => {
    expect((await app.inject("/health")).statusCode).toBe(200);
  });
  test("unauthenticated requests cannot read a profile", async () => {
    const response = await app.inject("/api/me");
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });
  test("invalid registration is rejected before persistence", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers,
      payload: { ...credentials, password: "short" },
    });
    expect(response.statusCode).toBe(400);
    expect(await db.select().from(schema.user)).toHaveLength(0);
  });
  test("registration ignores a requested admin role", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers,
      payload: { ...credentials, role: "admin" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe("member");
    expect(response.cookies.some((cookie) => cookie.httpOnly)).toBe(true);
    cookie = response.cookies
      .map((cookie) => cookie.name + "=" + encodeURIComponent(cookie.value))
      .join("; ");
  }, 15000);
  test("current user exposes only public profile fields", async () => {
    const response = await app.inject({ url: "/api/me", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().user).sort()).toEqual([
      "createdAt",
      "email",
      "id",
      "name",
      "role",
    ]);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
  test("member can use the mock cloud workspace", async () => {
    const users = await app.inject({ url: "/api/users", headers: { cookie } });
    expect(users.statusCode).toBe(200);
    expect(users.json().users[0].cloudAccountStatus).toBe("not_provisioned");
    const created = await app.inject({ method: "POST", url: "/api/vms", headers: { ...headers, cookie }, payload: { name: "mpi-worker", image: "Ubuntu 24.04 LTS", cpu: 2, memoryMb: 2048, diskGb: 10 } });
    expect(created.statusCode).toBe(201);
    const vm = created.json();
    expect((await app.inject({ url: `/api/vms/${vm.id}`, headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/vms", headers: { cookie } })).json().vms[0].id).toBe(vm.id);
    expect((await app.inject({ method: "POST", url: `/api/vms/${vm.id}/stop`, headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/cloud-accounts/provision", headers: { ...headers, cookie }, payload: {} })).statusCode).toBe(200);
  });
  test("passwords are hashed by Better Auth", async () => {
    const [account] = await db.select().from(schema.account);
    expect(account.password).toBeTruthy();
    expect(account.password).not.toBe(credentials.password);
  });
  test("profile update cannot promote a member", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/update-user",
      headers: { ...headers, cookie },
      payload: { role: "admin" },
    });
    const [user] = await db.select().from(schema.user);
    expect(user.role).toBe("member");
  });
  test("untrusted origins cannot perform auth mutations", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { ...headers, cookie, origin: "https://attacker.example" },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(
      (await app.inject({ url: "/api/me", headers: { cookie } })).statusCode,
    ).toBe(200);
  });
  test("logout invalidates the session in the database", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { ...headers, cookie },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(
      (await app.inject({ url: "/api/me", headers: { cookie } })).statusCode,
    ).toBe(401);
  });
  test("incorrect credentials are rejected", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers,
      payload: { email: credentials.email, password: "wrong-long-password" },
    });
    expect(response.statusCode).toBe(401);
  }, 15000);
  test("registered member can sign in again", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers,
      payload: { email: credentials.email, password: credentials.password },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe("member");
  }, 15000);
  test("CORS only allows the configured frontend", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/me",
      headers: {
        origin: "https://attacker.example",
        "access-control-request-method": "GET",
      },
    });
    expect(response.headers["access-control-allow-origin"]).not.toBe(
      "https://attacker.example",
    );
  });
});

describe("environment validation", () => {
  test("rejects a missing secret without exposing values", () => {
    expect(() =>
      readConfig({ DATABASE_URL: "postgresql://secret:secret@localhost/db" }),
    ).toThrow("Invalid environment");
  });
  test("requires HTTPS in production", () => {
    expect(() =>
      readConfig({
        ...config,
        PORT: String(config.PORT),
        NODE_ENV: "production",
      }),
    ).toThrow("HTTPS");
  });
});
