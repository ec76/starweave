# Disposable editorial verification runbook

This is a reusable opt-in procedure. The project owner manually completed it on
November 5, 2026; see the [verification record](../README.md#owner-performed-verification-november-5-2026).
For any new run, preparing scripts is local-only; database-writing steps wait
until the disposable targets and developer access have been explicitly confirmed. Do not use
`sqldb-called-together-dev`. No provisioning, permission, firewall, or deletion
commands are part of this runbook.

## Requirements and execution locations

- Two **existing, dedicated, empty Azure SQL databases**: one for normal migration
  verification and one that stays empty for first-migration rollback testing.
  Proposed names below are examples, not provisioned resources:
  `ct_editorial_migration_test` and `ct_bootstrap_migration_test`. Both must end in
  `_migration_test`, be distinct, and contain no real users/content or user-created
  objects. System objects in a fresh database are expected.
- An existing SQL logical server reachable over TLS on TCP 1433 with the
  developer's network access already allowed. Record its FQDN, Entra tenant,
  subscription and the two exact database names. Stop if a resource or required
  access is missing; arrange it separately rather than changing the live database.
- An authorized **developer user** signed into Azure CLI locally, and an Entra
  database principal already authorized in both test databases. No passwords,
  client secrets, App Service SSH, managed identity or deployment identity.
- Existing effective permissions sufficient for `CONNECT`, `CREATE TABLE`,
  `CREATE VIEW`, alteration of the `dbo` schema/tables/indexes, FK `REFERENCES`,
  history reads/inserts, fixture `SELECT`/`INSERT`/`UPDATE`/`DELETE`, and metadata
  visibility. Effective rights can come from already-approved scoped grants;
  this procedure neither grants them nor requires `db_owner`. System application
  locks use the `public` database principal. Do not elevate the runtime identity.
- Locally: source checkout containing these changes, Node.js 24, npm 11.19.1,
  installed dependencies, Azure CLI, and an Entra-capable SQL client with a
  persistent connection (for example, an SSMS query window). SQL syntax/features
  must support the included migrations (`ISJSON`, `rowversion`, `datetime2`,
  filtered indexes, `sp_getapplock`). Record engine/compatibility from preflight.

**Local PowerShell** means a terminal on your developer computer, at the repository
root. Even `az` commands run locally; they authenticate/read Azure management
state. **Azure SQL** means T-SQL executed by the selected Azure database through
your SQL client. No commands run in an App Service container. Use the same
persistent SQL connection for holding and releasing a session lock. A portal
editor or reconnecting client must not be assumed to preserve a SQL session.

## 1. Prepare scripts locally; no database access

Replace both example database names with the two approved existing targets if
they differ. Keep these variables in one local PowerShell session:

```powershell
Set-Location 'C:\Users\ericc\OneDrive\Desktop\Code\Project 1\starweave'
$TestServer = '<existing-logical-server>.database.windows.net'
$TestDatabase = 'ct_editorial_migration_test'
$BootstrapDatabase = 'ct_bootstrap_migration_test'
node --version
npm.cmd --version
npm.cmd run db:prepare-verification --workspace=called-together -- --database $TestDatabase --bootstrap-database $BootstrapDatabase
if ($LASTEXITCODE -ne 0) { throw 'SQL preparation failed; stop.' }
$VerificationDirectory = Join-Path (Get-Location) "apps/called-together/build/editorial-verification/$TestDatabase"
Get-ChildItem -LiteralPath $VerificationDirectory
```

Expected: Node v24.x, npm 11.19.1, and nine `.sql` files. The preparer prints both
names and explicitly reports **no SQL connection or Azure changes**. It refuses
live/ambiguous names, path-like names, and equal main/bootstrap targets. It only
writes ignored local build output. The generated SQL embeds exact target guards;
regenerate if names or migration source change. Do not commit generated scripts.

The existing fixture script now requires an exact database acknowledgement via
`SESSION_CONTEXT`, not just a suffix. Generated `03-constraints.sql` sets that
acknowledgement and includes the fixture in one submission. Do not run the raw
fixture file alone. If using it manually, prepend this in the same submission,
with the actual approved database name:

```sql
EXEC sys.sp_set_session_context
  @key = N'CalledTogetherVerificationDatabase',
  @value = N'ct_editorial_migration_test';
-- Append the entire editorial.integration.sql file here, in the same submission.
```

## 2. Authenticate and select the target locally (before SQL execution)

Only after the existing targets/access have been confirmed:

```powershell
az login --tenant '<sql-entra-tenant-id>'
az account set --subscription '<approved-subscription-id>'
az account show --query '{subscription:id,tenant:tenantId,identityType:user.type}' --output json
if ($LASTEXITCODE -ne 0) { throw 'Azure CLI selection failed; stop.' }
if ($env:WEBSITE_INSTANCE_ID -or $env:WEBSITE_SITE_NAME) { throw 'Use a local developer shell, not App Service.' }
if ($TestServer -match '[<>]' -or $TestServer -notmatch '^[a-z0-9][a-z0-9.-]*$') { throw 'Set the actual approved SQL server FQDN first.' }
if ($TestDatabase -eq 'sqldb-called-together-dev' -or $TestDatabase -notmatch '^[a-z0-9][a-z0-9_-]*_migration_test$') { throw 'Refusing a non-disposable database.' }
$env:SQL_SERVER = $TestServer
$env:SQL_DATABASE = $TestDatabase
```

Expected: selected tenant/subscription and `identityType` equal to `user`.
Stop if the wrong account/tenant is selected. Azure subscription access alone
does not confer SQL permissions. These explicit environment settings override
`apps/called-together/.env.local`; no environment-file editing is needed. Do not
print tokens, call `az account get-access-token` into logs, or change firewall or
permissions. The migration operator uses `AzureCliCredential`, TLS certificate
validation and the existing SQL connection settings.

Define this local wrapper. It checks the exact environment target before every
CLI operation and checks the expected process exit code:

```powershell
function Invoke-DisposableMigration {
    param(
        [ValidateSet('status', 'dry-run', 'apply')][string]$Mode,
        [ValidateSet(0, 1)][int]$ExpectedExit = 0
    )
    if ($env:SQL_SERVER -cne $TestServer -or $env:SQL_DATABASE -cne $TestDatabase -or
        $env:SQL_DATABASE -eq 'sqldb-called-together-dev' -or
        $env:SQL_DATABASE -notmatch '^[a-z0-9][a-z0-9_-]*_migration_test$') {
        throw 'Exact disposable server/database selection changed; stop.'
    }
    switch ($Mode) {
        'status' { npm.cmd run db:status:called-together }
        'dry-run' { npm.cmd run db:migrate:called-together -- --dry-run }
        'apply' { npm.cmd run db:migrate:called-together -- --apply }
    }
    if ($LASTEXITCODE -ne $ExpectedExit) { throw "Unexpected exit code for $Mode; stop and inspect." }
}
```

The general-purpose migration CLI itself is not disposable-only: the guard above
is part of this verification procedure. Do not bypass it for test operations.

## 3. Azure SQL: prove the main target is empty

Sign into the SQL client using Microsoft Entra interactive/MFA authentication
for the approved tenant. Explicitly connect to `$TestServer` and `$TestDatabase`.
Open the generated `01-preflight.sql` and execute the **entire file** in that
query window. Do not prepend a `USE` statement to switch Azure SQL databases;
choose the connection's database explicitly.

Expected: exact selected database name, engine version, compatibility level,
effective permission listings and:

```text
Empty disposable target verified. No schema changed.
```

It throws before testing if the database name differs or user objects already
exist. Permission listings are evidence to review, not grants or a guarantee
that every DDL operation will succeed. If access/metadata visibility is
insufficient, stop and consult the authorized operator.

## 4. Local: status, dry-run, then initial apply (deferred mutation)

Once Step 3 and target/access review pass, run:

```powershell
Invoke-DisposableMigration -Mode status
Invoke-DisposableMigration -Mode dry-run
```

Expected: both actual filenames pending (`0001_editorial_schema.sql` and
`0002_public_articles.sql`), `2 pending migration(s)`, and no schema changes.
Run `01-preflight.sql` again **in Azure SQL** to prove status/dry-run did not
create even the history table.

Now deliberately apply to this confirmed disposable target:

```powershell
Invoke-DisposableMigration -Mode apply
Invoke-DisposableMigration -Mode status
```

Expected: apply exits 0 with `Applied/verified` for both files and
`Migration run completed; history verified under the migration lock.` Status
exits 0 with `0 pending migration(s)`. Every command prints the exact server,
database, mode and Azure CLI credential source before connecting.

**Azure SQL**, same main target:

```sql
SELECT DB_NAME() AS DatabaseName;
SELECT Version, Filename, Checksum, AppliedAt
FROM dbo.CalledTogetherMigrations ORDER BY Version;
SELECT name, type_desc FROM sys.objects
WHERE is_ms_shipped = 0 ORDER BY type_desc, name;
SELECT COUNT(*) AS PublicArticleCount FROM dbo.PublicArticles;
```

Expected: versions 1/2 with 64-character SHA-256 values and UTC timestamps;
five editorial tables, history table, public view and their constraints/index
metadata; public article count 0. No sample content is seeded.

## 5. Repeat execution

**Local:**

```powershell
Invoke-DisposableMigration -Mode apply
Invoke-DisposableMigration -Mode status
```

Expected: exits 0, no pending-file `Applied/verified` lines, zero pending.

**Azure SQL, main target:** execute generated `02-repeat.sql`. It snapshots the
full history including `AppliedAt`, executes the exact production runner batch
twice, compares both directions with the snapshot, and throws on any difference.

Expected: `Repeat migration verification passed; history including AppliedAt is unchanged.`
This verifies the actual runner batch, not a separate imitation of migration SQL.

## 6. Constraints, publication view and fixture rollback

**Azure SQL, main target:** execute generated `03-constraints.sql` in one submission.
It tests unique author/article slugs, issuer+subject identity and per-article
revision numbering; language/status/JSON constraints; missing actors and cross-
article publication FKs; rowversion conflict handling; the review-history FK;
public-view field isolation and selected approved content. It also tests selected
`draft`, `submitted` and `changes_requested` revisions, an unselected approved
revision, archived and unpublished articles. None may appear in the public view.

Expected: `Disposable SQL constraint/public-view verification passed; fixtures rolled back.`
It explicitly checks that its actor/author/article/revision/review rows disappeared
after rollback. A failure aborts with a SQL error and rolls back fixtures. Approval
and publication mutations here are deliberately database-boundary tests, not
future authorized service workflows. No self-approval/role/rendering-safety claim
is made by this test.

### Rerun after the fixture slug failure

The fixture uses `LOWER(CONVERT(varchar(36), NEWID()))` because converted GUID
text contains uppercase hexadecimal letters, which the intentional binary-
collation lowercase-only slug constraint rejects. Base/external slug lengths
are 49/58 characters; length and hyphens are valid. An additional SQL regression
check requires the constraint to reject an uppercase author slug. Applied
migrations 0001/0002 and their history/checksums stay unchanged; no schema
migration is needed for this fixture-only correction.

With `OpenTransactions = 0`, regenerate locally:

```powershell
npm.cmd run db:prepare-verification --workspace=called-together -- --database ct_editorial_migration_test --bootstrap-database ct_bootstrap_migration_test
```

Reload generated `03-constraints.sql` from disk and execute the entire file,
including its guard/session acknowledgement, against `ct_editorial_migration_test`.
Expect the fixture pass message and `SELECT @@TRANCOUNT AS OpenTransactions;`
to return 0 afterward. Continue with `04-checksum.sql` onward. Do not rerun
`01-preflight.sql` on the main database: it requires emptiness, whereas 0001/0002
are already applied. Keep `06-bootstrap-rollback.sql` restricted to the separate
`ct_bootstrap_migration_test` database; do not apply real migrations there.

## 7. Checksum protection without modifying source files

**Azure SQL, main target:** execute generated `04-checksum.sql`.

Expected: `Checksum protection passed; edited applied SQL was rejected.` The file
uses the real runner with an **in-memory** changed first-migration checksum,
expects SQL error 51001, and asserts that all existing history/timestamps remain
unchanged. Unexpected success or any other error is a failure. No immutable
migration file or history row is edited. Local status-side checksum rejection is
covered by the offline unit tests; this script covers the locked SQL-side check.

## 8. Later-migration rollback and stop-on-failure

**Azure SQL, main target:** execute generated `05-rollback-after-prefix.sql`.

Expected: `Later-migration rollback passed twice; earlier history preserved; later migration did not run.`
It runs the actual batch with temporary **in-memory** versions 3/4: version 3
creates a probe then deliberately throws 52050; version 4 would create another
probe. Both attempts must leave neither probe table, no extra history entries,
no open transaction, and exactly the original committed versions 1/2 including
their checksums/timestamps. Probe migrations never enter the source directory.

## 9. First-migration and history-bootstrap rollback

**Azure SQL, a new connection to the second, still-empty `$BootstrapDatabase`:**
execute generated `06-bootstrap-rollback.sql`. This script's exact-name guard
rejects the main database.

Expected: `First-migration rollback passed twice; bootstrap history and all probe DDL are absent.`
It fails a synthetic first migration with 52050 twice and asserts there are no
user objects afterward, including no `CalledTogetherMigrations` history table.
There is no need to drop the real schema or reset the main database. Keep the
second database empty; do not apply the real migrations there for this test.

## 10. Session concurrency locking

**Azure SQL, persistent query window A connected to the main target:** execute
`07-hold-lock.sql`. Expected: a session ID and `Lock held...`; the session owns
the same exclusive `CalledTogether:editorial:migrations` application lock. Keep
the window/connection open. Do not use a client that reconnects for each query.

**Local PowerShell, while window A remains connected:**

```powershell
Invoke-DisposableMigration -Mode apply -ExpectedExit 1
```

Expected: nonzero exit and sanitized failure; **no successful completion line**.
The CLI intentionally does not print the raw SQL lock error. Contention is
non-waiting (`@LockTimeout=0`), although CLI compilation/authentication can take
time. Status may still succeed because status does not acquire the apply lock.
If apply succeeds, fail this test: confirm the first SQL connection still exists
and held the lock, rather than assuming the runner protected the database.

**Azure SQL, exactly the same window A:** execute `08-release-lock.sql`.
Expected: `Verification lock released; migration history is unchanged. Retry apply locally.`
The script checks the session's temporary history snapshot; a different/reconnected
session is rejected. If interrupted, close only your own test connection to release
its session lock; do not kill unknown sessions.

**Local:**

```powershell
Invoke-DisposableMigration -Mode apply
Invoke-DisposableMigration -Mode status
```

Expected: both exit 0 and status reports zero pending.

## 11. Final evidence and stop

**Azure SQL, main target:** execute generated `09-final.sql`. Expected: only the
real migration history, empty editorial tables/public view, and
`Final verification passed; real migrations recorded, editorial tables/view empty.`

Record both database names/server, engine/compatibility, source revision and
migration checksums, developer identity category (no credentials), each script's
pass/fail message and each CLI exit code. On failure, stop, preserve evidence,
run status against the same target and inspect privately; do not delete history,
change checksums, grant roles or retry with broader permissions. Database timeout
or connection loss near commit requires status inspection before conclusions.

Stop here. Database deletion and resource cleanup require separate explicit
authorization; no cleanup commands are included. You may close your own SQL
sessions. In a dedicated PowerShell session, close that terminal when done so
its temporary SQL settings do not affect later commands.

The [owner-performed verification record](../README.md#owner-performed-verification-november-5-2026)
documents the completed manual SQL checks. This reusable procedure and offline
unit tests are not evidence for a new run or changed schema: local checks cannot
prove SQL compilation, rollback, constraints or lock behavior on Azure. API access
and managed-identity SELECT permissions remain unverified.
