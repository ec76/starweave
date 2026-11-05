# Called Together editorial database

These files define the editorial schema, domain types and migration tools.
[Anonymous published-article read APIs](published-articles.md) use the public view.
There are no write APIs, login flows, role assignments, real accounts, or content
seeds. Application builds,
startup and deployment never run migrations. The operator requires a source
checkout; migration entry points and SQL files are not added to the App Service
runtime package. Existing private `verify:sql` packaging is unchanged.

## Model and publication

| Object                         | Responsibility                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dbo.Authors`                  | Public profile: globally unique slug, display name, optional biography/photo/alt/affiliation. Optional `ActorId` links to an internal identity; external contributors need no login. No login email is stored.                              |
| `dbo.EditorialActors`          | Internal issuer/subject pair (case-sensitive, unique together), display name, timestamps. No passwords, roles, or authorization rules. Issuer and subject each allow 200 Unicode characters.                                                |
| `dbo.Articles`                 | Stable identity, primary author, `en`/`es` language, globally unique route slug, publication pointer/dates and optional archive date. Translation grouping is a future extension; slugs are unique across languages for `/articles/[slug]`. |
| `dbo.ArticleRevisions`         | Versioned publishable content, unique positive revision number per article, draft/review status, creator/submitter, timestamps, SQL `rowversion`.                                                                                           |
| `dbo.ReviewDecisions`          | Append-only domain history for an exact revision and reviewer: approved/changes_requested, optional private comment, UTC decision time. Corrections must append decisions rather than overwrite history.                                    |
| `dbo.PublicArticles`           | Selected approved revision of a non-archived article, publication fields and public author fields only. Excludes actor links/identities, submission details and review comments.                                                            |
| `dbo.CalledTogetherMigrations` | Ordered version, filename, SHA-256 checksum and UTC application time; created transactionally with the first migration.                                                                                                                     |

All relationships use explicit foreign keys with SQL's default `NO ACTION`;
there are no cascading deletions. The composite publication foreign key ensures
the selected revision belongs to its article. The view independently checks
approval: selecting a draft does **not** make it readable through the view.
Indexes support foreign keys and language/publication-date listings. A later
service must select public content through this projection; the view alone does
not restrict access to base tables or grant permissions.

`FirstPublishedAt` persists after unpublishing. `PublishedAt` describes the current
publication and is null when there is no selected revision. Publishing sets both
initially; republishing retains the first date and updates the current date.
Archiving removes an article from the view without deleting its history.
Titles, summaries, rich bodies and display metadata use Unicode SQL types.
Slugs are lowercase ASCII alphanumeric segments separated by single hyphens,
maximum 160 characters. Timestamps are `datetime2(3)` UTC with initial
`SYSUTCDATETIME()` defaults; future services must update `UpdatedAt` explicitly.
No trigger automatically maintains update timestamps.

`domain/editorial.ts` defines immutable record shapes and narrow validation
helpers. IDs are UUID strings and timestamps are UTC ISO strings at the domain
boundary; these aliases are not runtime UUID/date validators. SQL rows will need
an explicit mapping in the later service: parse `BodyJson`, validate its envelope,
serialize SQL's 8-byte `rowversion` as `0x` plus 16 hex digits, and serialize dates
as UTC. Always use the original rowversion in an update predicate and reject
zero affected rows as a conflict. Rowversion is neither a timestamp nor the
human revision number.

The initial editor-neutral body envelope is:

```json
{
  "version": 1,
  "format": "called-together.rich-text",
  "content": {}
}
```

`content` is a JSON object reserved for a later editor format; no editor library
is selected. The TypeScript validator checks version, format, object content,
finite JSON values and bounded nesting (64 levels), and rejects cycles and
non-JSON values. SQL `ISJSON` checks JSON **syntax only**; it accepts other JSON
objects/arrays that the domain envelope validator rejects. Neither check validates
editor structure or makes rendered content safe. Future rendering must allowlist
supported structures/URLs, escape text and apply appropriate sanitization.
Optional photo/sharing alt text can be empty for decorative images; meaningful
alternative text and URL policies belong to later content validation.

### Rules reserved for transactional services

Foreign keys do not implement editorial authorization or workflow. Later services
must enforce approval permissions, prevent self-approval, define author/actor
relationships for that check, and protect approved revisions from edits. An edit
to approved content must create a new draft, preserving the currently published
revision until a replacement is approved and selected. Review history is readonly
in the domain design, but SQL triggers or scoped write permissions are not added
here: a schema administrator can still modify it.

In one authorized transaction, services must check rowversion and legal status
transitions, append the exact review decision, change revision status, and update
publication pointer/dates as appropriate. They must allocate revision numbers
safely under concurrency, keep stable identity/language/author changes consistent,
maintain timestamps, and ensure archived/unpublished content follows policy.
There is no scheduling, permission checking or state-transition API in this change.

## Developer commands and authentication

Run at the repository root with Node 24 and npm 11.19.1 (`npm.cmd` in PowerShell
if script execution is disabled):

```sh
npm run db:status:called-together
npm run db:migrate:called-together
npm run db:migrate:called-together -- --dry-run
# Deliberate database mutation; do not run until the target/identity are approved:
npm run db:migrate:called-together -- --apply
```

Status and default/dry-run read history and verify the local files. They do not
create the history table or change schema. The sole `--apply` argument enables
writes. Unknown/conflicting flags fail before connection. Each command compiles
the private operator via the existing `build:sql` toolchain; compilation itself
never opens SQL. The selected server/database, mode and Azure CLI credential
source are printed before connecting or applying changes. Review the target
before invoking `--apply`; there is no subsequent interactive prompt.

Settings are the existing `SQL_SERVER` and `SQL_DATABASE`, loaded from
`apps/called-together/.env.local` if present (existing environment variables take
precedence). No new secret settings are required. Do not use `NEXT_PUBLIC_`,
store tokens/passwords, or copy App Service identity settings locally. Follow the
root README's `az login --tenant ...` and subscription selection instructions.
The authorized developer must already have an Entra database user and deliberately
scoped schema-migration privileges for this database, plus required SQL firewall
access. Azure subscription membership alone is insufficient.

The migration command refuses `WEBSITE_INSTANCE_ID`/`WEBSITE_SITE_NAME` and uses
only the existing local `AzureCliCredential` path, never managed identity or a
client-secret fallback. Do not bypass that refusal by removing App Service
settings. Keep the runtime managed identity out of `db_owner`, `db_ddladmin` and
schema-admin privileges. This change makes no role, grant, firewall or Azure
resource changes. Future runtime grants should be narrowly scoped to the needed
read/service operations, separately reviewed. No CI or deployment step runs these
commands against SQL.

The migration pool is dedicated (maximum one connection), validates TLS and uses
a 120-second batch timeout with the existing bounded connection/pool timeouts.
A single `mssql` batch holds the physical session for the entire run. An exclusive
`sp_getapplock` session lock in the target database prevents concurrent runs;
lock acquisition is non-waiting, so a second apply fails rather than racing.
History is checked again **after** acquiring the lock. Each file and its history
insert are committed in their own transaction with `XACT_ABORT ON`. The history
bootstrap is in the first file's transaction. Failures roll back the active
transaction, stop the batch, release the lock and close the dedicated pool;
earlier successful migrations remain committed. Connection loss also releases
the session lock. No automatic retries or down migrations are provided.

## Adding migrations and recovery

Use contiguous four-digit versions: `0001_description.sql`, `0002_description.sql`,
and so on, with lowercase letters/digits/underscores in the description. SQL files
must be nonempty, transaction-compatible T-SQL without `GO` separators or explicit
transaction management. Put a view definition in its own file (SQL requires
`CREATE VIEW` to be first in its batch); the runner executes each file through
`sp_executesql`. Do not add statements that release the migration lock or write
the history table. These are trusted, reviewed source files, not user input.

Checksums cover UTF-8 SQL text after removing a leading BOM and normalizing CRLF
to LF, so Windows/Linux checkouts agree; other whitespace/content changes alter
the hash. Applied filenames and content are immutable. The runner rejects gaps,
duplicate versions, unknown database versions, renames and checksum mismatches.
Status is meaningful only when the checkout contains the database's full history.

After any failure, run status with the same target and inspect the recorded
prefix before retrying. A failed first migration leaves no history table; a
failed later migration leaves earlier entries. For drift, restore the exact
applied files from version control; do not edit database checksums or delete
history rows to force success. For a genuinely new, never-applied migration,
correct the cause and retest in a disposable database. If a migration has already
succeeded in another environment, preserve it and add a forward corrective
migration or address the environmental precondition. If a connection times out
or fails around commit, treat the outcome as uncertain until status confirms it.
A held lock may indicate another operator; confirm its session has ended before
retrying. Do not kill unknown SQL sessions. Inspect detailed SQL errors only in
an authorized SQL client; this operator intentionally does not print driver
messages, SQL bodies, credential objects or tokens.

## Opt-in real SQL verification

Follow the [exact local/Azure SQL runbook](verification/README.md) for initial
apply, repeat execution, constraints, publication filtering, fixture/DDL/history
rollback, checksum protection and session locking. It requires two existing,
explicitly selected disposable databases ending in `_migration_test`; never
use `sqldb-called-together-dev`. It does not provision resources, grant access
or delete databases.

Prepare guarded SQL files **offline**, with no database connection:

```sh
npm run db:prepare-verification --workspace=called-together -- --database ct_editorial_migration_test --bootstrap-database ct_bootstrap_migration_test
```

These target names were used in the owner-performed verification recorded below.
Preparation does not provision them. Generated SQL goes into
ignored `build/editorial-verification/<database>` output and embeds exact target
checks. Failure/checksum probes are generated in memory using the real runner;
there is no need to edit applied source migrations. The second database tests
first-migration/history-bootstrap rollback while remaining empty. The fixture
script additionally requires an exact database acknowledgement in the same SQL
session; the generated constraints script supplies it.

**Repeat real SQL verification when schema or runner behavior changes.** The
project owner manually completed the checks recorded below; local preparation
and unit tests alone are not SQL integration evidence. No preparation command
applies migrations or contacts Azure. Unit tests cover guards, ordering/checksums,
read-only modes, batch construction, mocked failure/cleanup, domain validation
and script generation. They cannot prove T-SQL compiles or real database
constraints, transactional rollback, session locks, workflow permissions or
rendering safety. Do not treat local checks as a real SQL test.

## Owner-performed verification: November 5, 2026

The following results were reported by the project owner after **manual**
execution against Azure SQL. They were not executed by the coding agent. This
record describes the tested schema/migration behavior, not application API access
or the runtime managed identity's SELECT permissions; those remain pending.

### Disposable database: ct_editorial_migration_test

- Status and dry-run left the empty database unchanged.
- Migrations 0001 and 0002 applied successfully.
- Repeat application preserved migration history, including AppliedAt.
- Constraints and public-view filtering passed; fixtures rolled back.
- Checksum protection rejected modified applied SQL.
- A later-migration failure rolled back; earlier history remained intact and
  the subsequent migration did not run.
- A SQL session held the migration lock while a competing CLI apply failed with
  exit 1. The CLI error was generic and did not explicitly identify lock
  contention. After the session released the lock, apply succeeded with exit 0.
- Final verification confirmed that the real migration history remained and
  the editorial tables and public view were empty.

### Separate disposable database: ct_bootstrap_migration_test

- First-migration rollback passed twice.
- Migration history and probe DDL were absent afterward.

### Development database: sqldb-called-together-dev

- Dry-run reported the expected two pending migrations.
- Apply reported:

  ```text
  Applied/verified: 0001_editorial_schema.sql
  Applied/verified: 0002_public_articles.sql
  ```

- Final status reported zero pending migrations.

Migrations have therefore already been manually applied to the development
database. Deployment, build and application startup **do not apply migrations
automatically**. Future schema changes require new ordered migrations and a
separately authorized manual apply; do not edit applied history or SQL files.

### Fixture correction and remaining work

Generated GUID text could contain uppercase hexadecimal letters, violating the
intended lowercase author-slug constraint. Fixture generation now uses
`LOWER(CONVERT(varchar(36), NEWID()))`. Regression coverage and an explicit
uppercase-slug rejection assertion were added. Applied migrations 0001 and 0002
were unchanged by this correction.

The schema verification above did not verify API access or user authentication.
The read-only API implementation is documented separately; user authentication
and write endpoints remain future work. Approval permissions, self-approval
prevention, approved-revision immutability and transactional service
workflows remain future work. API database access and managed-identity SELECT
permissions have **not** been verified by this record. No new runtime grants,
Azure role changes, sample-content seeds or automatic deployment migrations are
part of this change.

## Published-article read access

The project owner reports manually granting SELECT on `dbo.PublicArticles` to
`[called-together-dev-ec76]` in `sqldb-called-together-dev`. This records the
owner-performed grant, not a permission change by the coding agent. Effective
access from the deployed application using its managed identity remains
**unverified**, including successful live API reads. Follow the
[local, deployment and live verification steps](published-articles.md). An empty
development database should return HTTP 200 with an empty list, not an error.
