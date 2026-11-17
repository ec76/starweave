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
): "status" | "dry-run" | "apply" | "diagnose-connection" {
  if (args.length === 1 && args[0] === "--diagnose-connection")
    return "diagnose-connection";
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run"))
    return "dry-run";
  if (args.length === 1 && args[0] === "--status") return "status";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  throw new MigrationValidationError(
    "Use no options, --dry-run, --status, --apply, or --diagnose-connection alone.",
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
function safeDriverDiagnostics(error: unknown) {
  const entries: Record<string, unknown>[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  const clean = (value: string) =>
    value
      .replace(
        /(password|token|secret|connection(?:string)?|account(?:id)?|user(?:id)?)\s*[=:]\s*[^\s;,]+/gi,
        "$1=[REDACTED]",
      )
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        "[REDACTED]",
      )
      .slice(0, 1000);
  while (queue.length && entries.length < 16) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    const row = item as Record<string, unknown>;
    const diagnostic: Record<string, unknown> = {};
    for (const key of ["code", "number", "state", "class"])
      if (typeof row[key] === "string" || Number.isInteger(row[key]))
        diagnostic[key] = row[key];
    entries.push(diagnostic);
    for (const key of ["cause", "originalError"])
      if (row[key] && typeof row[key] === "object") queue.push(row[key]);
    if (Array.isArray(row.precedingErrors)) {
      diagnostic.precedingErrors = row.precedingErrors.map((value) => {
        const p = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const key of ["code", "number", "state", "class"])
          if (typeof p[key] === "string" || Number.isInteger(p[key]))
            result[key] = p[key];
        return result;
      });
      queue.push(...row.precedingErrors);
    }
  }
  return entries;
}
export async function migrate(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  let pool: sql.ConnectionPool | undefined;
  let result = 0;
  let stage = "configuration";
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
    stage = "identity acquisition and connection opening";
    await pool.connect();
    stage = "exact database target guard";
    const target = await pool
      .request()
      .query<{ name: string }>("SELECT DB_NAME() AS name");
    if (target.recordset[0]?.name !== config.database)
      throw new MigrationValidationError(
        "Connected SQL database does not match the explicitly configured target.",
      );
    if (mode === "diagnose-connection") {
      console.log(
        "Connection diagnostic passed: exact target confirmed; no transaction or migration started.",
      );
      return 0;
    }
    stage = "migration history read";
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
    const message =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "";
    const marker = message.match(
      /MIGRATION (\d+) ([a-z0-9_]+\.sql) stage=([a-z_]+)\s+error=\d+: /i,
    );
    console.error(
      error instanceof MigrationValidationError
        ? error.message
        : "Migration command failed. " +
            sqlFailureMessage(error) +
            " Stage=" +
            (marker?.[3] ?? stage) +
            (marker ? "; migration=" + marker[1] + "/" + marker[2] : "") +
            "; diagnostics=" +
            JSON.stringify(safeDriverDiagnostics(error)),
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
