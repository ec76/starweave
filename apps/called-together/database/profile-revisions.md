# Author profile revisions

Issue #25 adds migration `0008`; applied migrations remain unchanged. Accounts
and editorial actors retain their existing binding. `Authors` is the stable
ownership/slug record; public display names never change the account name or
credentials. A Writer creates a profile through `/admin/profiles`. The server
uses the authenticated session, never form-supplied actor or ownership fields.
Administrator plus Writer may select another profile using the profile links.

`dbo.AuthorProfileOperation` rechecks activated, verified, invited, enabled
accounts, session expiry, Writer and ownership under the account administration
lock. Administrator alone has no access. Reads and history use the same gate.
Every Save appends an immutable `AuthorProfileRevisions` content snapshot with
the saving actor, their name at save time and SQL UTC timestamp. This snapshot is
also the record of the save action; failed operations leave no snapshot. The
latest revision ID is the concurrency token, including the initial null token.
An old token fails with conflict rather than overwriting history. Concurrent
creation with a null profile ID resolves existing ownership before comparing
the token. Existing legacy author records without revisions can be explicitly
saved by their owner or an Administrator with Writer.

`ApprovedProfileRevisionId` is separate from the latest saved revision. This
ticket provides no approval endpoint or public directory. The public article
view reads only the selected approved snapshot. The migration retains attribution
already exposed by an approved, unarchived publication as a clearly labelled
legacy snapshot; it does not invent a saving actor or approve other legacy
profiles. Other legacy content is retained as a private initial snapshot so its
owner can inspect and edit it without reconstructing their profile. Direct
changes to old `Authors` content columns cannot change anonymous
attribution. Future approval work must update the approved pointer through its
own authorized, audited transaction. Until then new profiles remain private.

Runtime access requires an owner-reviewed object-level `EXECUTE` grant on
`dbo.AuthorProfileOperation` to the existing runtime principal, using the same
deployment permission process as account procedures. Do not grant direct table
reads/writes on `Authors` or `AuthorProfileRevisions`, schema-wide execute, or
database roles. No runtime permission or Azure changes are made by this work.
The existing public `SELECT dbo.PublicArticles` grant continues through ownership
chaining. Existing password-only permission scripts describe their older baseline;
do not replay them as a profile permission migration.

## Disposable verification

Use the existing `db:prepare-verification` command and two explicitly selected
empty `_migration_test` databases described in `verification/README.md`. It now
also prepares `10-profiles.sql`. Run that script **after** `09-final.sql` only in
the dedicated normal target. It checks all eight role combinations, ownership,
immutable content/actor/time, stale saves, failure rollback, pending privacy and
live role/disable/session rechecks. Unlike scripts 01–09, script 10 deliberately
commits fictional fixtures so denied procedures can roll back independently;
it requires empty stores and leaves fixtures for inspection. It cannot be rerun
in that populated target. There are no real credentials or deliverable addresses.

For the concurrency check, open two connections to that same disposable target.
Run prepared `11-profile-capture.sql` in **both** before either runs
`12-profile-save.sql`. Run the saves concurrently: exactly one must succeed and
the other must report SQL 53309. Run `13-profile-check.sql` in both connections;
each must show exactly one appended snapshot and the same new head. Temp tables
keep each connection's original expected token. Never use these probes on a live
database. This work prepares verification; execution requires a selected,
authorized disposable target. No database was selected by #25 itself.

## Verification completed November 17, 2026

Resumed at check 05 on `sql-called-together-dev-ec76.database.windows.net`,
using the existing Azure CLI developer user. Exact targets were
`ct_editorial_migration_test` and `ct_bootstrap_migration_test`. Before execution,
the main target had versions 1–8 matching all source filenames/checksums, no
rollback probes and zero open transactions; bootstrap had no user objects.

Checks 05 and 06 each passed twice, requiring public error 51998 and the exact
synthetic migration diagnostic with original error 52050. Check 07 held the
session lock; the competing CLI apply exited 1 with SQL 51000. Check 08 released
that lock with unchanged history. Unlocked CLI apply and status each exited 0,
with zero pending migrations. Check 09 passed before fixture creation.

Check 10 passed persistence, authorization, role matrix, immutability, rollback
and public projection assertions. Both connections captured the same head and
four retained revisions in check 11. Concurrent check 12 saves produced one
success and one exact SQL 53309 stale-save rejection. Check 13 in both sessions
confirmed five revisions and the same new head. Final inspection confirmed
unchanged migration history including timestamps, no rollback probe residue,
zero open transactions and an empty bootstrap database. Fictional fixtures were
retained. No migrations were newly applied, and no databases were reset or dropped.
