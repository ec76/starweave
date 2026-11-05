import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface Migration {
  readonly version: number;
  readonly filename: string;
  readonly checksum: string;
  readonly sql: string;
}
export interface MigrationHistory {
  readonly version: number;
  readonly filename: string;
  readonly checksum: string;
}
export class MigrationValidationError extends Error {}

// Git checkouts may use CRLF. Hash UTF-8 text with LF and no leading BOM.
export function migration(filename: string, source: string): Migration {
  if (filename.length > 200 || !/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(filename))
    throw new MigrationValidationError("Invalid migration filename.");
  const sql = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!sql.trim() || /^\s*GO\s*(?:--.*)?$/im.test(sql))
    throw new MigrationValidationError(
      "Migrations must be nonempty SQL without GO separators.",
    );
  return {
    version: Number(filename.slice(0, 4)),
    filename,
    sql,
    checksum: createHash("sha256").update(sql, "utf8").digest("hex"),
  };
}
export function orderMigrations(files: readonly Migration[]): Migration[] {
  const ordered = [...files].sort((a, b) => a.version - b.version);
  if (!ordered.length || ordered.some((m, i) => m.version !== i + 1))
    throw new MigrationValidationError(
      "Migration versions must be unique and contiguous, starting at 0001.",
    );
  return ordered;
}
export async function loadMigrations(directory: string): Promise<Migration[]> {
  const names = await readdir(directory);
  return orderMigrations(
    await Promise.all(
      names
        .filter((name) => name.endsWith(".sql"))
        .map(async (name) =>
          migration(name, await readFile(path.join(directory, name), "utf8")),
        ),
    ),
  );
}
export function pendingMigrations(
  files: readonly Migration[],
  history: readonly MigrationHistory[],
): Migration[] {
  const ordered = orderMigrations(files);
  const applied = [...history].sort((a, b) => a.version - b.version);
  if (
    applied.some((entry, i) => {
      const file = ordered[i];
      return (
        entry.version !== i + 1 ||
        !file ||
        entry.filename !== file.filename ||
        entry.checksum !== file.checksum
      );
    })
  )
    throw new MigrationValidationError(
      "Migration history differs from local files. Restore applied files; never edit history to bypass this check.",
    );
  return ordered.slice(applied.length);
}

const literal = (value: string) => "N'" + value.replaceAll("'", "''") + "'";

export const historyQuery = `
IF OBJECT_ID(N'dbo.CalledTogetherMigrations', N'U') IS NULL
    SELECT CAST(NULL AS int) AS version, CAST(NULL AS nvarchar(200)) AS filename, CAST(NULL AS char(64)) AS checksum WHERE 1 = 0;
ELSE
    EXEC sys.sp_executesql N'SELECT Version AS version, Filename AS filename, Checksum AS checksum FROM dbo.CalledTogetherMigrations ORDER BY Version';
`;

/** One batch reserves one physical mssql connection for the full session lock. */
export function createApplyBatch(files: readonly Migration[]): string {
  const ordered = orderMigrations(files);
  return `
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @lockResult int;
EXEC @lockResult = sys.sp_getapplock @Resource = N'CalledTogether:editorial:migrations', @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 0, @DbPrincipal = 'public';
IF @lockResult < 0 THROW 51000, 'Another migration run holds the lock, or lock acquisition failed.', 1;
BEGIN TRY
    DECLARE @expected TABLE (version int PRIMARY KEY, filename nvarchar(200) COLLATE Latin1_General_100_BIN2, checksum char(64) COLLATE Latin1_General_100_BIN2);
    INSERT @expected VALUES ${ordered.map((m) => `(${m.version}, ${literal(m.filename)}, ${literal(m.checksum)})`).join(",\n")};
    DECLARE @history TABLE (version int PRIMARY KEY, filename nvarchar(200) COLLATE Latin1_General_100_BIN2, checksum char(64) COLLATE Latin1_General_100_BIN2);
    IF OBJECT_ID(N'dbo.CalledTogetherMigrations', N'U') IS NOT NULL
        INSERT @history EXEC sys.sp_executesql N'SELECT Version, Filename, Checksum FROM dbo.CalledTogetherMigrations';
    IF EXISTS (SELECT 1 FROM @history h LEFT JOIN @expected e ON e.version = h.version WHERE e.version IS NULL OR e.filename <> h.filename OR e.checksum <> h.checksum)
       OR EXISTS (SELECT 1 FROM @expected e WHERE e.version <= (SELECT MAX(version) FROM @history) AND NOT EXISTS (SELECT 1 FROM @history h WHERE h.version = e.version))
        THROW 51001, 'Migration history differs from local files.', 1;
    ${ordered
      .map(
        (m) => `
    IF NOT EXISTS (SELECT 1 FROM @history WHERE version = ${m.version})
    BEGIN
        BEGIN TRANSACTION;
        ${
          m.version === 1
            ? `IF OBJECT_ID(N'dbo.CalledTogetherMigrations', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.CalledTogetherMigrations (
                Version int NOT NULL CONSTRAINT PK_CalledTogetherMigrations PRIMARY KEY,
                Filename nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT UQ_CalledTogetherMigrations_Filename UNIQUE,
                Checksum char(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
                AppliedAt datetime2(3) NOT NULL CONSTRAINT DF_CalledTogetherMigrations_Applied DEFAULT SYSUTCDATETIME(),
                CONSTRAINT CK_CalledTogetherMigrations_Version CHECK (Version > 0),
                CONSTRAINT CK_CalledTogetherMigrations_Checksum CHECK (Checksum NOT LIKE '%[^0-9a-f]%')
            );
        END;`
            : ""
        }
        EXEC sys.sp_executesql ${literal(m.sql)};
        EXEC sys.sp_executesql N'INSERT dbo.CalledTogetherMigrations (Version, Filename, Checksum) VALUES (@v, @f, @c)', N'@v int, @f nvarchar(200), @c char(64)', @v=${m.version}, @f=${literal(m.filename)}, @c=${literal(m.checksum)};
        COMMIT TRANSACTION;
    END;
    `,
      )
      .join("\n")}
    EXEC sys.sp_releaseapplock @Resource = N'CalledTogether:editorial:migrations', @LockOwner = 'Session', @DbPrincipal = 'public';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    EXEC sys.sp_releaseapplock @Resource = N'CalledTogether:editorial:migrations', @LockOwner = 'Session', @DbPrincipal = 'public';
    THROW;
END CATCH;
`;
}

export interface MigrationStore {
  readHistory(): Promise<MigrationHistory[]>;
  apply(files: readonly Migration[]): Promise<void>;
}
export async function runMigrations(
  store: MigrationStore,
  files: readonly Migration[],
  apply: boolean,
): Promise<Migration[]> {
  const ordered = orderMigrations(files);
  const pending = pendingMigrations(ordered, await store.readHistory());
  // The SQL batch checks history again while holding the lock, including no-op runs.
  if (apply) await store.apply(ordered);
  return pending;
}
