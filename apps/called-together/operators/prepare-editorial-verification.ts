import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createApplyBatch,
  loadMigrations,
  migration,
  MigrationValidationError,
  type Migration,
} from "./migrations.js";

const literal = (value: string) => "N'" + value.replaceAll("'", "''") + "'";
export function disposableDatabase(value: string): string {
  if (
    value.length > 128 ||
    !/^[a-z0-9][a-z0-9_-]*_migration_test$/.test(value) ||
    value === "sqldb-called-together-dev"
  )
    throw new MigrationValidationError(
      "Select an exact lowercase disposable database name ending in _migration_test (maximum 128 characters).",
    );
  return value;
}
export function verificationTargets(args: readonly string[]) {
  if (
    args.length !== 4 ||
    args[0] !== "--database" ||
    args[2] !== "--bootstrap-database"
  )
    throw new MigrationValidationError(
      "Use --database <disposable_migration_test> --bootstrap-database <different_empty_migration_test>.",
    );
  const database = disposableDatabase(args[1]!);
  const bootstrapDatabase = disposableDatabase(args[3]!);
  if (database === bootstrapDatabase)
    throw new MigrationValidationError(
      "Use two distinct disposable databases for normal and first-migration failure verification.",
    );
  return { database, bootstrapDatabase };
}
export function databaseGuard(database: string): string {
  const selected = disposableDatabase(database);
  return `-- Prepared for exactly ${selected}. No resource provisioning or permissions are included.
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> ${literal(selected)} COLLATE Latin1_General_100_BIN2
    OR RIGHT(DB_NAME(), 15) <> N'_migration_test' OR DB_NAME() = N'sqldb-called-together-dev'
    THROW 52100, 'Wrong disposable database selected; no verification executed.', 1;
IF @@TRANCOUNT <> 0 THROW 52101, 'Use a session without an existing transaction.', 1;
SET NOCOUNT ON;
`;
}
const execute = (sql: string) => `EXEC sys.sp_executesql ${literal(sql)};\n`;
function expectedFailure(sql: string, code: number): string {
  return `BEGIN TRY
    ${execute(sql)}
    THROW 52102, 'Expected migration failure did not occur.', 1;
END TRY BEGIN CATCH
    IF ERROR_NUMBER() <> ${code} THROW;
END CATCH;
IF @@TRANCOUNT <> 0 THROW 52103, 'Migration failure left a transaction open.', 1;
`;
}
const historyColumns = "Version, Filename, Checksum, AppliedAt";
function baseline(files: readonly Migration[]): string {
  return `IF OBJECT_ID(N'dbo.CalledTogetherMigrations', N'U') IS NULL THROW 52104, 'Apply the real migrations first.', 1;
DECLARE @before TABLE (Version int, Filename nvarchar(200) COLLATE Latin1_General_100_BIN2, Checksum char(64) COLLATE Latin1_General_100_BIN2, AppliedAt datetime2(3));
INSERT @before SELECT ${historyColumns} FROM dbo.CalledTogetherMigrations;
IF (SELECT COUNT(*) FROM @before) <> ${files.length}
    ${files.map((file) => `OR NOT EXISTS (SELECT 1 FROM @before WHERE Version = ${file.version} AND Filename = ${literal(file.filename)} AND Checksum = ${literal(file.checksum)})`).join("\n    ")}
    THROW 52105, 'Database history does not match the prepared source files.', 1;
`;
}
function unchangedHistory(): string {
  return `IF EXISTS (SELECT ${historyColumns} FROM @before EXCEPT SELECT ${historyColumns} FROM dbo.CalledTogetherMigrations)
    OR EXISTS (SELECT ${historyColumns} FROM dbo.CalledTogetherMigrations EXCEPT SELECT ${historyColumns} FROM @before)
    THROW 52106, 'Existing migration history changed during verification.', 1;
`;
}
const noProbes = `IF OBJECT_ID(N'dbo.MigrationRollbackProbe', N'U') IS NOT NULL
    OR OBJECT_ID(N'dbo.MigrationAfterFailureProbe', N'U') IS NOT NULL
    THROW 52107, 'A rollback probe or later migration survived.', 1;
`;
const emptyDatabase = `IF EXISTS (SELECT 1 FROM sys.objects WHERE is_ms_shipped = 0)
    THROW 52108, 'This test requires an empty disposable database with no user objects.', 1;
`;
export function verificationScripts(
  files: readonly Migration[],
  fixture: string,
  database: string,
  bootstrapDatabase: string,
): Record<string, string> {
  // Both names must be validated even when this helper is called without the CLI.
  verificationTargets([
    "--database",
    database,
    "--bootstrap-database",
    bootstrapDatabase,
  ]);
  const guard = databaseGuard(database);
  const apply = createApplyBatch(files);
  const initial =
    guard +
    emptyDatabase +
    `SELECT DB_NAME() AS DatabaseName, @@VERSION AS EngineVersion;
SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME();
SELECT permission_name FROM sys.fn_my_permissions(NULL, 'DATABASE') ORDER BY permission_name;
SELECT permission_name FROM sys.fn_my_permissions('dbo', 'SCHEMA') ORDER BY permission_name;
PRINT 'Empty disposable target verified. No schema changed.';
`;
  const repeat =
    guard +
    baseline(files) +
    execute(apply) +
    unchangedHistory() +
    execute(apply) +
    unchangedHistory() +
    "PRINT 'Repeat migration verification passed; history including AppliedAt is unchanged.';\n";
  const changed = files.map((file, index) =>
    index === 0
      ? migration(
          file.filename,
          file.sql + "\n-- Deliberate verification checksum change.\n",
        )
      : file,
  );
  const checksum =
    guard +
    baseline(files) +
    expectedFailure(createApplyBatch(changed), 51001) +
    unchangedHistory() +
    "PRINT 'Checksum protection passed; edited applied SQL was rejected.';\n";
  const next = files.length + 1;
  const failureFiles = [
    ...files,
    migration(
      `${String(next).padStart(4, "0")}_verification_failure.sql`,
      "CREATE TABLE dbo.MigrationRollbackProbe (Id int NOT NULL);\nTHROW 52050, 'Deliberate disposable failure', 1;",
    ),
    migration(
      `${String(next + 1).padStart(4, "0")}_verification_after_failure.sql`,
      "CREATE TABLE dbo.MigrationAfterFailureProbe (Id int NOT NULL);",
    ),
  ];
  const rollback =
    guard +
    baseline(files) +
    noProbes +
    expectedFailure(createApplyBatch(failureFiles), 52050) +
    noProbes +
    unchangedHistory() +
    expectedFailure(createApplyBatch(failureFiles), 52050) +
    noProbes +
    unchangedHistory() +
    "PRINT 'Later-migration rollback passed twice; earlier history preserved; later migration did not run.';\n";
  const bootstrapFiles = [
    migration(
      "0001_verification_failure.sql",
      "CREATE TABLE dbo.MigrationRollbackProbe (Id int NOT NULL);\nTHROW 52050, 'Deliberate disposable failure', 1;",
    ),
    migration(
      "0002_verification_after_failure.sql",
      "CREATE TABLE dbo.MigrationAfterFailureProbe (Id int NOT NULL);",
    ),
  ];
  const bootstrap =
    databaseGuard(bootstrapDatabase) +
    emptyDatabase +
    expectedFailure(createApplyBatch(bootstrapFiles), 52050) +
    emptyDatabase +
    expectedFailure(createApplyBatch(bootstrapFiles), 52050) +
    emptyDatabase +
    "PRINT 'First-migration rollback passed twice; bootstrap history and all probe DDL are absent.';\n";
  return {
    "01-preflight.sql": initial,
    "02-repeat.sql": repeat,
    "03-constraints.sql":
      guard +
      `EXEC sys.sp_set_session_context @key=N'CalledTogetherVerificationDatabase', @value=${literal(database)};\n` +
      fixture.replace(/^\uFEFF/, ""),
    "04-checksum.sql": checksum,
    "05-rollback-after-prefix.sql": rollback,
    "06-bootstrap-rollback.sql": bootstrap,
    "07-hold-lock.sql":
      guard +
      baseline(files) +
      `IF OBJECT_ID('tempdb..#CalledTogetherHistoryBeforeLock') IS NOT NULL THROW 52109, 'Release the previous verification lock in this window first.', 1;
SELECT ${historyColumns} INTO #CalledTogetherHistoryBeforeLock FROM dbo.CalledTogetherMigrations;
DECLARE @lockResult int;
EXEC @lockResult = sys.sp_getapplock @Resource=N'CalledTogether:editorial:migrations', @LockMode='Exclusive', @LockOwner='Session', @LockTimeout=0, @DbPrincipal='public';
IF @lockResult < 0 THROW 52110, 'Could not hold the verification lock.', 1;
SELECT @@SPID AS HoldThisSessionOpen;
PRINT 'Lock held. Keep this SQL connection open while attempting apply locally. Release in this same SQL window.';
`,
    "08-release-lock.sql":
      guard +
      `IF OBJECT_ID('tempdb..#CalledTogetherHistoryBeforeLock') IS NULL THROW 52111, 'Use the same live SQL session that ran 07-hold-lock.sql.', 1;
DECLARE @releaseResult int;
EXEC @releaseResult = sys.sp_releaseapplock @Resource=N'CalledTogether:editorial:migrations', @LockOwner='Session', @DbPrincipal='public';
IF @releaseResult < 0 THROW 52112, 'Lock release failed; confirm the original session.', 1;
IF EXISTS (SELECT ${historyColumns} FROM #CalledTogetherHistoryBeforeLock EXCEPT SELECT ${historyColumns} FROM dbo.CalledTogetherMigrations)
    OR EXISTS (SELECT ${historyColumns} FROM dbo.CalledTogetherMigrations EXCEPT SELECT ${historyColumns} FROM #CalledTogetherHistoryBeforeLock)
    THROW 52113, 'Migration history changed during the locked apply attempt.', 1;
DROP TABLE #CalledTogetherHistoryBeforeLock;
PRINT 'Verification lock released; migration history is unchanged. Retry apply locally.';
`,
    "09-final.sql":
      guard +
      baseline(files) +
      `IF EXISTS (SELECT 1 FROM dbo.EditorialActors) OR EXISTS (SELECT 1 FROM dbo.Authors)
    OR EXISTS (SELECT 1 FROM dbo.Articles) OR EXISTS (SELECT 1 FROM dbo.ArticleRevisions)
    OR EXISTS (SELECT 1 FROM dbo.ReviewDecisions) OR EXISTS (SELECT 1 FROM dbo.PublicArticles)
    THROW 52114, 'The dedicated disposable database contains unexpected content.', 1;
SELECT ${historyColumns} FROM dbo.CalledTogetherMigrations ORDER BY Version;
PRINT 'Final verification passed; real migrations recorded, editorial tables/view empty.';
`,
  };
}
export async function prepareVerification(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  try {
    const { database, bootstrapDatabase } = verificationTargets(args);
    const app = fileURLToPath(new URL("../../../", import.meta.url));
    const files = await loadMigrations(path.join(app, "database/migrations"));
    const fixture = await readFile(
      path.join(app, "database/verification/editorial.integration.sql"),
      "utf8",
    );
    const output = path.join(app, "build/editorial-verification", database);
    await mkdir(output, { recursive: true });
    for (const [filename, source] of Object.entries(
      verificationScripts(files, fixture, database, bootstrapDatabase),
    ))
      await writeFile(path.join(output, filename), source, "utf8");
    console.log(`Prepared SQL only: ${output}`);
    console.log(
      `Main disposable database: ${database}; empty bootstrap-test database: ${bootstrapDatabase}.`,
    );
    console.log(
      "No SQL connection, migrations, Azure resource changes or permission changes were made. Review and run scripts only after approval.",
    );
    return 0;
  } catch (error) {
    console.error(
      error instanceof MigrationValidationError
        ? error.message
        : "Could not prepare verification SQL. Check local source files and output directory.",
    );
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await prepareVerification();
