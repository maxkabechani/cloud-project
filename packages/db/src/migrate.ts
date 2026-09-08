import { createDatabase, databaseOptions } from "./index";
import { migrateDatabase } from "./migrations";
const database = await createDatabase(databaseOptions(process.env));
try {
  await migrateDatabase(database);
  console.info(database.provider + " database migrations applied.");
} finally {
  await database.close();
}
