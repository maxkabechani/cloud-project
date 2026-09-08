import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as postgresSchema from "@hpc/db/schema";
import * as sqliteSchema from "@hpc/db/schema/sqlite";
import type { Config } from "./config";

export const AUTH_CLIENT_IP_HEADER = "x-hpc-client-ip";

export function createAuth(
  db: Parameters<typeof drizzleAdapter>[0],
  config: Config,
) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: config.DATABASE_PROVIDER === "sqlite" ? "sqlite" : "pg",
      schema:
        config.DATABASE_PROVIDER === "sqlite" ? sqliteSchema : postgresSchema,
    }),
    baseURL: config.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.WEB_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        // Roles are never accepted from registration or profile updates.
        role: {
          type: ["member", "admin"],
          defaultValue: "member",
          required: true,
          input: false,
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: {
      useSecureCookies: config.NODE_ENV === "production",
      ipAddress: { ipAddressHeaders: [AUTH_CLIENT_IP_HEADER] },
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
  });
}
export type Auth = ReturnType<typeof createAuth>;
