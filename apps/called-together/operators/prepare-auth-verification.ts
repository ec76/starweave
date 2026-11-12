import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  loadMigrations,
  createApplyBatch,
  type Migration,
} from "./migrations.js";
export function disposableAuthDatabase(value: string) {
  if (!/^ct_[a-z0-9_]+_auth_test$/.test(value) || value.length > 128)
    throw new Error(
      "Choose an explicit ct_*_auth_test disposable database; development is forbidden.",
    );
  return value;
}
export function authVerification(database: string): Record<string, string> {
  const selected = disposableAuthDatabase(database);
  return {
    "README.md":
      "Owner-run password account verification for " +
      selected +
      ". Review migration history and account state before any owner action. Preserve applied migrations and checksums. For initialized targets, do not bootstrap or replay initial setup: use the existing-account continuation in database/admin-auth.md. Bootstrap is only for a separately authorized empty account store. AUTH_INTEGRATION=1 enables the local HTTP/Mailpit verifier, not deployed authentication. Historical recovery checks apply only to their exact baselines: history 1-5 after failed 0006 uses database/verification/password-migration-recovery-status.sql; history 1-6 after failed 0007 uses database/verification/password-migration-0007-recovery-status.sql. Neither recovery baseline applies to a database with 0001-0007 already applied. This generator makes no SQL connection and creates no accounts.\n",
  };
}
export function authApplySql(
  database: string,
  migrations: readonly Migration[],
) {
  const selected = disposableAuthDatabase(database);
  return (
    "IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'" +
    selected +
    "' THROW 53100, 'Wrong disposable database.', 1;\nIF @@TRANCOUNT <> 0 THROW 53114, 'Start without an open transaction.', 1;\nIF (@@OPTIONS & 2)=2 THROW 53115, 'Use autocommit with IMPLICIT_TRANSACTIONS OFF; existing work is not ended automatically.', 1;\n" +
    createApplyBatch(migrations)
  );
}
export async function run(args: readonly string[]) {
  if (args.length !== 2 || args[0] !== "--database")
    throw new Error("Usage: --database ct_explicit_auth_test");
  const selected = disposableAuthDatabase(args[1]!);
  const directory = path.resolve("build/auth-verification", selected);
  const files = authVerification(selected);
  const migrations = await loadMigrations(path.resolve("database/migrations"));
  files["00-apply.sql"] = authApplySql(selected, migrations);
  await mkdir(directory, { recursive: true });
  for (const [name, source] of Object.entries(files))
    await writeFile(path.join(directory, name), source, "utf8");
  console.log(
    "Prepared guarded SQL for " +
      selected +
      ". No SQL connection or migration execution occurred.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv.slice(2)).catch(() => {
    console.error(
      "Could not prepare disposable auth verification. Supply an exact ct_*_auth_test name.",
    );
    process.exitCode = 1;
  });
