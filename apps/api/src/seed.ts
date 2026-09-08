import { createDatabase, databaseOptions } from "@hpc/db";
import { registrationSchema } from "@hpc/shared";
import { createAuth } from "./auth";
import { readConfig } from "./config";
const config = readConfig(process.env);
const parsed = registrationSchema.safeParse({
  name: process.env.ADMIN_NAME,
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
if (!parsed.success)
  throw new Error(
    "Set valid ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (12–128 characters).",
  );
const input = parsed.data;
const database = await createDatabase(databaseOptions(config));
try {
  const existing = await database.findUserByEmail(input.email.toLowerCase());
  if (existing) {
    if (existing.role !== "admin")
      throw new Error(
        "Seed email already belongs to a member. Use a new admin email.",
      );
    console.info("Admin already exists; no changes made.");
  } else {
    const auth = createAuth(database.db, config);
    const result = await auth.api.signUpEmail({ body: input });
    await database.setUserRole(result.user.id, "admin");
    console.info("Admin created.");
  }
} finally {
  await database.close();
}
