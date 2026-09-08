import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/schema.sqlite.ts",
  out: "./migrations-sqlite",
  dialect: "sqlite",
});
