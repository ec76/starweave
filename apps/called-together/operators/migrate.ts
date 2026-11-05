import { fileURLToPath, pathToFileURL } from "node:url";
import sql from "mssql";
import { connectionConfig, sqlFailureMessage } from "../server/database.js";
import {
  createApplyBatch,
  historyQuery,
  loadMigrations,
  MigrationValidationError,
  runMigrations,
  type MigrationHistory,
  type MigrationStore,
} from "./migrations.js";

export function migrationConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): sql.config {
  if (env.WEBSITE_INSTANCE_ID || env.WEBSITE_SITE_NAME)
    throw new MigrationValidationError(
      "Migrations require an authorized developer Azure CLI identity outside App Service.",
    );
  const config = connectionConfig(env);
  return {
    ...config,
    requestTimeout: 120000,
    options: { ...config.options, appName: "Called Together migrations" },
    pool: { ...config.pool, max: 1 },
  };
}
export function migrationMode(
  args: readonly string[],
): "status" | "dry-run" | "apply" {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run"))
    return "dry-run";
  if (args.length === 1 && args[0] === "--status") return "status";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  throw new MigrationValidationError(
    "Use no options, --dry-run, --status, or --apply alone.",
  );
}
export function sqlMigrationStore(pool: sql.ConnectionPool): MigrationStore {
  return {
    async readHistory() {
      const result = await pool.request().batch<MigrationHistory>(historyQuery);
      return result.recordset;
    },
    async apply(files) {
      await pool.request().batch(createApplyBatch(files));
    },
  };
}
export async function migrate(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  let pool: sql.ConnectionPool | undefined;
  let result = 0;
  try {
    const mode = migrationMode(args);
    const config = migrationConfig();
    console.log(
      `SQL target: server=${config.server}; database=${JSON.stringify(config.database)}; mode=${mode}; identity=Azure CLI developer.`,
    );
    const files = await loadMigrations(
      fileURLToPath(new URL("../../../database/migrations/", import.meta.url)),
    );
    pool = new sql.ConnectionPool(config);
    let poolFailed = false;
    pool.on("error", () => {
      poolFailed = true;
    });
    await pool.connect();
    const pending = await runMigrations(
      sqlMigrationStore(pool),
      files,
      mode === "apply",
    );
    if (poolFailed) throw new Error("Migration connection failed.");
    for (const file of pending)
      console.log(
        `${mode === "apply" ? "Applied/verified" : "Pending"}: ${file.filename}`,
      );
    console.log(
      mode === "apply"
        ? "Migration run completed; history verified under the migration lock."
        : `${pending.length} pending migration(s). No schema changes made. Use db:migrate:called-together -- --apply to apply.`,
    );
  } catch (error) {
    console.error(
      error instanceof MigrationValidationError
        ? error.message
        : "Migration command failed. " +
            sqlFailureMessage(error) +
            " Check status before retrying; a failed migration rolls back, earlier migrations may have committed. Driver diagnostics are not logged.",
    );
    result = 1;
  } finally {
    try {
      await pool?.close();
    } catch {
      console.error("Migration connection cleanup failed.");
      result = 1;
    }
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await migrate();
