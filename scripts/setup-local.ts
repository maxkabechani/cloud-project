import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL("../", import.meta.url));
async function createIfMissing(relative: string, content: string) {
  try {
    await writeFile(new URL("../" + relative, import.meta.url), content, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "EEXIST"
    )
      throw error;
  }
}
const example = await readFile(
  new URL("../apps/api/.env.example", import.meta.url),
  "utf8",
);
await createIfMissing(
  "apps/api/.env",
  example.replace(
    "BETTER_AUTH_SECRET=",
    "BETTER_AUTH_SECRET=" + randomBytes(32).toString("hex"),
  ),
);
await createIfMissing(
  "apps/web/.env.local",
  "NEXT_PUBLIC_API_URL=http://localhost:4000\n",
);
// Launch with the env file as the API does; migrate.ts validates its database selection.
const apiEnv = await readFile(
  new URL("../apps/api/.env", import.meta.url),
  "utf8",
);
if (!/^DATABASE_PROVIDER=sqlite\s*$/m.test(apiEnv))
  throw new Error(
    "Local setup preserves existing settings. Set DATABASE_PROVIDER=sqlite in apps/api/.env to continue.",
  );
const child = Bun.spawn(
  [process.execPath, "--env-file=apps/api/.env", "packages/db/src/migrate.ts"],
  {
    cwd: project,
    env: {
      ...process.env,
      DATABASE_PROVIDER: "sqlite",
      NODE_ENV: "development",
    },
    stdout: "inherit",
    stderr: "inherit",
  },
);
const status = await child.exited;
if (status !== 0) process.exit(status);
console.info(
  "Local SQLite is ready. Run bun run dev and create your account at http://localhost:3000/register.",
);
