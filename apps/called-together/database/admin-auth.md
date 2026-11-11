# Password accounts and activity

## Owner verification record — November 11, 2026

The owner reported that migrations **0001–0007** are applied to
`ct_password_auth_test`, the targeted authenticated session API/admin page check
passed, and the full actual application HTTP/SQL/Mailpit verification passed.
Test fixtures and append-only audit remain in that disposable database for review.
These are owner-reported results; the coding agent did not connect to SQL.

Production/deployed authentication and least-privilege runtime access remain
**unverified**. Deployed email delivery remains **unimplemented**. Configuration
keeps deployed authentication closed; local Mailpit success does not establish
production readiness. There are no deployment-time migrations. Applying SQL or
changing permissions/resources requires a separate owner operation.

All seven migration sources are now applied history and must remain unchanged.
The canonical LF-normalized SHA-256 checksums are pinned by regression coverage:

| Version | Checksum                                                           |
| ------- | ------------------------------------------------------------------ |
| 0001    | `6ababa871a4679153b99c7fbb918b915491fa859b0876a76513bb64ac6b86485` |
| 0002    | `b6b92838fa0c8d029690dde5d0de172dfe29f46ac8cd6a2e0d54d15dbc27216f` |
| 0003    | `2ae528aa634d1f0afd085c2e1c4b1be937a919e2dfb9c5a5e780cd6a9e829990` |
| 0004    | `30edabc68219c619e372ba71c8e376cacbedc3d37f605def3ad63db3870d9cfe` |
| 0005    | `ab4a8d212384f339bd36b74f35fb7d4536e0b20dad6a7a2f15233cac7af778d1` |
| 0006    | `15755292dfa4e247e176d4201d45e7a9003ba1f6f6f75e7ac1e4df7ff0baba2a` |
| 0007    | `bd3d5806aeb848dd5f760b9a8f890a67cabe2b6d756e65a828e6f9cef7c7539c` |

The version-5/version-6 recovery scripts below are historical diagnostics for
those exact failed baselines, not post-0007 status checks or instructions to
replay setup against the verified database. Keep them for regression/recovery
reference. Use the account-state check only when deciding an explicit continuation.

Implementation assessment: November 11, 2026. This replaces the passwordless
workflow. Branch: `feat/called-together-password-accounts`.
Azure managed identity for SQL, Azure CLI credentials locally, GitHub OIDC,
deployment resources and the anonymous public article API/pages are retained.
No SQL connection, migration, bootstrap, permission change or deployment is
performed by the coding agent. Historical pending-verification notes below are
superseded for the disposable target only by the owner record above.

## Stage 1: account setup and password authentication

Only an Administrator creates accounts, with display name, canonical email and
one or more additive Writer/Approver/Administrator roles. No public registration
or broad Better Auth catch-all endpoint is mounted. Administrator alone does not
authorize editorial operations or self-approval. Stable account/actor IDs remain
the identity keys; email and display name are never authorization keys.

Creation and bootstrap enqueue a notification atomically with their account,
role and audit writes. The local Mailpit notification links to `/admin/setup`
without any password, token or bearer credential. Delivery follows commit;
failure leaves an outbox row for explicit retry. Safe-link duplicates are possible
under concurrent retries (at-least-once delivery). No code is in this outbox.

The user requests a five-minute eight-digit setup code and submits it together
with a chosen 12–128 character password. The library verifies/consumes the code
before setting the password. This intentionally avoids a separate custom setup
grant or authentication protocol. Setup uses the supported OTP password-reset
mechanism to create the first credential on an existing eligible account.
Completion verifies email, activates the account and accepts its invitation in
the same transaction as the credential write and `setup_completed` event.
No automatic login occurs; the user signs in using email and password.

Recovery at `/admin/reset` uses a separate verification table. A setup code cannot
reset a password, and a recovery code cannot activate a pending account. Library
OTP hashing, expiry, attempt limits, atomic consumption, password hashing and
session handling are retained. Codes never enter URLs, responses or logs.
Recovery revokes existing sessions and does not sign the user in. Unknown,
disabled, expired-invitation and wrong-state accounts get generic public responses.
Unknown login is still passed through the library's normal password-failure
work, while the SQL session-creation hook rejects inactive/disabled accounts.

Session lifetime defaults to **43,200 seconds (12 hours)**, configurable through
`ADMIN_SESSION_SECONDS`, bounded to 3,600–604,800 seconds. Refresh is disabled so
this is an absolute lifetime, not an indefinite sliding session. Secure HTTP-only
`__Secure-__Host-ct-session` cookies persist through navigation and browser refresh.
Cookie caching is disabled. Session reads defer cleanup to write requests, so an
expired cookie returns unauthenticated without invoking transactional write hooks
from a page read. Every protected request rechecks SQL liveness,
activation, verified/enabled status, accepted invitation and current roles.
Role changes revoke affected sessions. Disablement/revocation takes effect on
the next protected request. CSRF origin/token/body limits and safe redirects
remain enforced; repeated `roles` fields are allowed only for creation.

`credentials.ts` runs policy, library writes and business audit hooks through
`authTransaction`. All use one driver transaction and connection. The Kysely
base-clone API keeps the transaction executor/lifecycle guard while permitting
Better Auth's schema introspection, which a Kysely Transaction rejects.
Schema validation remains enabled. The library's nested adapter transaction
option is false because the application already owns the transaction. Expected
OTP rejection responses commit attempt accounting; unexpected SQL/hook errors
roll back credentials, activation, sessions and their audit events together.

Only these form routes are exposed: `/api/auth/login`, `/logout`, `/csrf`,
`/setup/code`, `/setup`, `/reset/code`, `/reset`. The library's passwordless,
registration, link-reset and broad user-management paths are also disabled in
configuration. The JSON session token from library login is discarded; only
Set-Cookie is forwarded. None of the setup/recovery responses forward credentials.

## Library and security review

Pinned Better Auth **1.7.18** supports password login, disabling registration,
OTP password reset, library-managed scrypt and SQL Server via Kysely/Tedious.
The November 3 coordinated advisories were fixed in 1.7.16, including OTP races,
address binding and session-revocation issues. The installed version is newer
than that fixed boundary. The production npm audit on November 11 reported zero
findings; this is not proof that future advisories or integration failures are absent. Review future advisories before deployment. No custom
password hash, OTP generator or bearer-grant protocol is implemented here.

Primary references checked November 11:

- [Email/password options and reset revocation](https://better-auth.com/docs/authentication/email-password)
- [Supported email OTP recovery](https://better-auth.com/docs/plugins/email-otp)
- [SQL Server adapter and DateTime2 mapping](https://better-auth.com/docs/adapters/mssql)
- [November security release and advisories](https://better-auth.com/blog/security-release-2026-11-03)
- [Mailpit local integration API](https://mailpit.axllent.org/docs/integration/)

Azure Identity 4.14.1, its patched MSAL path, mssql 12.7.13, Tedious 20.3.8,
Kysely 0.29.8 and Tarn 3.0.2 remain unchanged. The existing driver error
preservation, Tarn creation-error propagation and DateTime2 mapping remain.
Initial `EPARAM` reports alone did not establish which runtime parameter failed;
the confirmed Next.js module-identity cause and runtime regression are documented below.
Local-only `AUTH_DEBUG=1` retains allowlisted stage/classification/SQL-number
diagnostics, including safe `throttle_binding` name/type/category fields. Never
enable raw mssql/Tedious debug logging. All service-generated throttle bindings
are tested through the installed RPC validator without a SQL socket; valid
collation and missing-collation cases are distinct tests, not claims about SQL.

## Stage 2: management and audit

`0006_password_accounts_and_activity.sql` adapts the former no-credentials
constraint to credential-only library hashes, adds the setup verification store,
activation timestamp, notification outbox, immutable business activity table,
and bounded security aggregates. It invalidates all old sessions and verification
codes. Account IDs, editorial actors, role assignments, article ownership and
history are preserved. Existing users must complete password setup; accepted
legacy invitations remain eligible, while unaccepted invitations still expire.

`0007_password_account_operations.sql` adds/replaces narrow procedures. Bootstrap
takes the same transaction-owned application lock as account changes and setup.
It rejects **any existing account**, not merely existing Administrators, and
therefore rejects repeats and competing attempts even while the first account
is still pending. It creates only Administrator, with no default password.

The last-admin check counts only enabled, verified, activated Administrators.
Pending invitations never count. Serialized operations cannot disable/demote
both of the last two active Administrators. Role changes, enable/disable and
explicit revocation invalidate target sessions and commit with their audit.

`ActivityEvents` has stable UUIDs, UTC times, explicit event/outcome and actor kind,
acting/target account IDs, optional article/exact-revision IDs, role, allowlisted
reason and correlation UUID. Existing `AuthAuditEvents` are copied with their
original IDs/times and a `legacy` reason, then retained. Both histories have
update/delete rejection triggers. Runtime has no direct activity SELECT/INSERT/
UPDATE/DELETE rights: owned procedures append and the Administrator-authorized
`AuthListActivity` procedure reads. Business audit failure aborts its transaction.

Implemented events: created/bootstrap, setup/email verification completed,
role grant/revoke (including initial assignment), account enable/disable, login,
logout, session revocation, password reset and cutover. They contain no passwords,
hashes, codes, cookies, addresses, bodies or raw errors. Login/logout attribution
uses account ID; unauthenticated setup/reset uses explicit system actor plus
target account ID; bootstrap uses operator actor. CreatedAt/UpdatedAt remain.

Anonymous rejection and code-request events are **separate fixed-size security
aggregates**, not mutable business history. `AuthSecurityEvent` commits outside
the rejected authentication transaction. It stores at most 168 hourly slots
times four categories, saturating each counter at 100,000: login_failed,
code_requested, code_rejected, reset_failed. Each hour/category has a stable UUID
and UTC period; no attempted address, IP, HMAC or request content is retained.
Slots are reused after seven days. `code_requested` records successful receipt
of a generic request, not proof of eligibility/delivery; other categories are
failures. A failed security write returns generic 503 and sanitized diagnostics.
No per-attempt security row can grow storage without bound.

Per-minute SQL throttles use global and per-address HMAC buckets: code requests
20 global/3 address; login and code completion 60 global/5 address, per action.
They are independent of claimed proxy IPs. No limiter is disabled or bypassed.
Business activity is restricted, append-only history; retention/archive is an
explicit owner policy (no runtime purge). Owners should periodically purge
expired sessions/verification rows and old throttle buckets, not audit history, under
their maintenance identity. Never grant audit ALTER/TRUNCATE or blanket schema
rights to runtime. A privileged database owner cannot be constrained by table
DENY; do not use it as runtime.

Administrator-only `/admin/activity` and `/api/admin/activity` paginate 50 rows
with account ID, event type and UTC date filters. Views render safe fields only;
filter validation and database policy remain server-side. Audit records never
enter public article DTOs. `domain/activity.ts` defines future article creation,
edit, archive, submit, changes-requested, approve, publish and unpublish types
and the shared transactional audit interface. No editor mutation service exists
today, so these events are **not emitted**. Future services must enforce Writer/
Approver/ownership/self-approval policy, append exact revision IDs inside their
business transaction and prefer archive over deletion.

## Narrow runtime permissions (owner action only)

Review `verification/password-runtime-permissions.sql`; replace its database/user
placeholders and execute only as an explicit owner action. It refuses privileged
runtime roles and supplies object-level rights only:

- Library DML on AuthUsers, AuthSessions, AuthAccounts, AuthVerifications and
  AuthSetupVerifications; SELECT on invitations and roles.
- SELECT/UPDATE on safe-link notification outbox; no direct inserts/deletes.
- EXECUTE on AuthManageAccount, AuthThrottle, AuthBeginSession,
  AuthRecordSessionEvent, AuthCompletePassword, AuthSecurityEvent, AuthListActivity.
- Direct SELECT and DML DENY on both audit histories, security aggregates and
  throttle storage; direct role/invitation writes denied. Same-owner procedures
  retain their ownership chains. Bootstrap and pending-recovery EXECUTE denied to runtime.

The operator's bootstrap permission is separate. No principal, role membership,
grant or Azure resource was changed by this implementation. Test these rights
with the actual non-owner runtime identity, including direct audit modification
and non-Administrator listing attempts. Inherited ALTER/CONTROL/ownership must
also be absent. Existing public article SELECT remains unchanged.

## Continue after verifier failure at the admin page

The Next.js runtime defect is established by
`node apps/called-together/operators/verify-next-session-runtime.mjs --unexternalized`
from the repository root. This launches an isolated Next dev app with the actual
production repository, installed mssql/Tedious validators, and an in-memory
transport; it creates no SQL connection and loads no application .env file.
The API request seeds the shared global database holder with a route-bundle pool;
the RSC page binds its separately bundled mssql type to that pool's Request.
mssql's function-identity mapping misses that type and Tedious receives an
unmapped function without a validator (`sql_type_identity_unmapped`). A string
ID and a local sqlTypeMatches=true do not detect this cross-bundle mismatch.
There is one installed mssql 12.7.13/Tedious 20.3.8 dependency pair, not duplicate
installed versions. Separate Next module graphs created the duplication.

`serverExternalPackages: ["mssql", "tedious"]` keeps Node module identities shared
between RSC and route handlers. Running the same script without
`--unexternalized` uses the application's configured externals and requires both
the API and RSC page to pass. No identity coercion or SQL authorization change is
involved. Fully stop/restart Next after this configuration change; HMR alone is
insufficient because the old global pool and old bundles can remain alive.

For the already active account, restart the app, retain the existing database
and original AUTH_VERIFY_ADMIN_EMAIL, and run only the affected authenticated
checks (plus normal reset/login to replace the lost in-memory verifier password):

```powershell
$env:AUTH_VERIFY_CONTINUE_ACTIVE = '1'
$env:AUTH_VERIFY_ADMIN_PAGE_ONLY = '1'
npm.cmd run auth:verify-sql --workspace=called-together -- --database ct_password_auth_test --run
```

This skips setup, bootstrap, account creation, role edits and the remaining audit
scenario. Normal password reset revokes old sessions. Unset both flags afterward.
Alternatively, an already authenticated browser can reload `/api/admin/session`
and `/admin` without any reset or verifier run. Require API 200 and the account
management view; a page HTTP 200 alone does not indicate authorization success.
Failures now identify `authenticated_admin_page`, rather than `bootstrap_setup`.

Do not bootstrap again or replay first-time setup without checking state.
The page and `/api/admin/session` use the same `requestAdminSession` service and
SQL liveness/account/invitation/role gates. A successful API response does not
prove the subsequent page request succeeded.

Run `database/verification/password-account-continuation-status.sql` as the owner
in a clean autocommit connection to `ct_password_auth_test`. It returns counts
only, never account identities, passwords or session values.

- If TotalAccounts=1, PendingAccounts=0, DisabledAccounts=0 and
  ReadyAdministrators=1, keep the existing account. In the local verifier terminal
  set `$env:AUTH_VERIFY_CONTINUE_ACTIVE = '1'`. Preserve AUTH_VERIFY_ADMIN_EMAIL as
  the original bootstrap address. This mode uses normal reset-code/password reset
  to replace the lost in-memory verifier password and revoke old sessions, then
  resumes password login and the remaining route checks. It never calls setup.
- If TotalAccounts=1, PendingAccounts=1 and DisabledAccounts=0, the account is
  still pending. Use the normal setup verifier with AUTH_VERIFY_CONTINUE_ACTIVE
  unset; do not run bootstrap again. If the invitation expired, stop for the
  existing owner recovery process rather than resetting the database.
- Any other counts or transaction state require owner review before continuing.
  In particular, additional accounts mean this early-stage continuation is not
  appropriate.

Restart the local HTTPS app with AUTH_DEBUG=1 and the corrected source. Confirm
the same `ct_password_auth_test` target in the app and verifier, AUTH_INTEGRATION=1,
and local Mailpit/notification delivery remain running. For the active case:

```powershell
$env:AUTH_VERIFY_CONTINUE_ACTIVE = '1'
npm.cmd run auth:verify-sql --workspace=called-together -- --database ct_password_auth_test --run
```

After completion unset AUTH_VERIFY_CONTINUE_ACTIVE. If `/admin` fails, stop and
share only the sanitized `session_binding` and `session_liveness` diagnostic rows.
The binding diagnostic allowlists `id`, SQL/JavaScript types, length, fixed schema
collation and validation category. Connection collation is explicitly unobserved
at this pool boundary; installed Tedious nvarchar validation does not require it.
A string ID passes standalone installed validation, but does not protect against
cross-bundle driver type identity mismatches. Do not coerce IDs to a string.

Cookie presence uses the installed Better Auth cookie-name derivation with shared
options. Its secure prefix makes the effective custom name
`__Secure-__Host-ct-session`; the previous diagnostic checked only the unprefixed
custom name. Only presence booleans are logged; issuance and authentication are
unchanged.

## Recovery after committed 0006 and failed 0007

The owner confirmed 0006 committed on 2026-11-11 at 19:56:18.972 and 0007 is
absent. Preserve 0001–0006, including the corrected 0006, unchanged. The older
version-5 inspection below no longer applies to this database.

Unapplied 0007 now explicitly collates all seven text projections in both
`AuthListActivity` UNION ALL branches to `Latin1_General_100_BIN2`, including
typed NULLs for aggregate account IDs and role. Authorization is unchanged.

1. In a clean owner autocommit connection to `ct_password_auth_test`, run
   `database/verification/password-migration-0007-recovery-status.sql` read-only.
   Require every `Passed=1`, `CleanUnappliedBaseline=1`, no errors, implicit mode
   off, and entry/inspection/final transaction count/state 0/0. It pins history
   1–6, checks 0006 schema markers, requires the four new 0007 procedures absent,
   and verifies original procedure hashes to detect partially altered procedures.
   Any failure means stop for owner review; do not remove objects or edit history.
2. Only after that passes, use VS Code **File: Revert File**, close the generated
   `build/auth-verification/ct_password_auth_test/00-apply.sql` tab and reopen that
   exact file. Do not save a stale buffer. Confirm the executable AuthListActivity
   UNION contains explicit collations in both branches. Clear selections and
   execute the entire regenerated file in the same clean connection. The runner
   validates and skips 1–6 and applies only 7 under its transaction/session lock.
3. Verify history 1–7 with matching source checksums and capture transaction state
   using separate SET assignments as below; require 0/0. If it fails, stop and
   retain complete error headers/line numbers. Do not rerun the version-5 check.

This inspection establishes metadata consistency, not a historical data snapshot.
The coding agent did not connect to SQL or execute migrations.

## Historical recovery after the failed 0006 collation attempt

The owner confirmed 0006/0007 have not succeeded in any database. The failed
`ct_password_auth_test` attempt retained exactly the original history 1–5.
Owner metadata inspection passed all schema-restoration checks: original
constraint/procedures present and unchanged; new column, index, tables, triggers
and procedures absent. The old **NoOpenTransaction** check evaluated live state
inside a SELECT and could observe that statement's own transaction. Its failure
does not establish an existing transaction; rerun the corrected inspection below.

The exact conflict was `accountId = userId` in `CK_AuthAccounts_Credentials`.
0003 gives `userId` the binary identity collation but leaves `accountId` on the
database default. Corrected, still-unapplied 0006 now explicitly compares
`accountId COLLATE Latin1_General_100_BIN2 = userId`; no column types, password
requirements or applied migrations were changed. Its new canonical checksum is
`15755292dfa4e247e176d4201d45e7a9003ba1f6f6f75e7ac1e4df7ff0baba2a`.
0007 remains unchanged, checksum
`008327ec58c96ab32f3d1dae787d8570ecc7cd2d3bd33b138976e9e2d4cfca02`.
No 0008 was added. The generated batch was regenerated from source, not patched
by changing recorded checksums in the database.

Owner-run recovery, without removing objects or changing history:

1. In the original connection, obtain only connection state:

   ```sql
   DECLARE @n int, @s int, @i int;
   SET @n = @@TRANCOUNT;
   SET @s = XACT_STATE();
   SET @i = CASE WHEN (@@OPTIONS & 2)=2 THEN 1 ELSE 0 END;
   SELECT @@SPID AS SessionId, DB_NAME() AS CurrentDatabase,
       @n AS OpenTransactions, @s AS TransactionState,
       @i AS ImplicitTransactionsEnabled;
   ```

   Do not blindly commit or roll back unidentified pending work. Resolve that
   connection's transaction only after owner review. A table-reading SELECT in
   implicit mode can itself start a transaction, even when it makes no data
   changes; the prior inspection did not distinguish this from an existing one.

2. Use a separate, clean owner connection to `ct_password_auth_test`, with client
   autocommit enabled. Check its SessionId and transaction state before reads.
   In that clean connection only:

   ```sql
   IF @@TRANCOUNT <> 0 OR XACT_STATE() <> 0
       THROW 53304, 'Use a clean connection; existing work must be reviewed.', 1;
   SET IMPLICIT_TRANSACTIONS OFF;
   ```

3. Run `database/verification/password-migration-recovery-status.sql` again. The
   updated read-only script captures entry state with separate SET assignments
   before metadata/lock work, refusing existing transactions and implicit mode.
   It samples inspection and final state between statements and reports stored
   values, avoiding SELECT's own execution context. APPLOCK_TEST acquires no lock;
   availability is advisory, and the migration runner still takes its own lock.
   Require every `Passed=1`, `CleanUnappliedBaseline=1`, entry/inspection/final
   transaction count/state 0/0, and no error. Any failed check or timeout means stop for owner
   review; do not drop objects, edit migration history, or bootstrap.

4. Only after that passes, review and execute the **regenerated**
   `build/auth-verification/ct_password_auth_test/00-apply.sql` in the same clean
   autocommit connection. It rejects an open transaction or implicit mode before
   taking the migration lock, verifies 1–5 checksums, and applies only 6/7.

   Before executing, discard any unsaved changes in that generated SQL editor:
   in VS Code use **File: Revert File**, close the tab, and reopen the exact path
   above from Explorer. Do not save a stale buffer over the regenerated file.
   Confirm its executable 0006 `ADD CONSTRAINT CK_AuthAccounts_Credentials`
   contains `accountId COLLATE Latin1_General_100_BIN2 = userId` (the surrounding
   dynamic SQL doubles the quotes in `N''credential''`). Clear any selection and
   execute the entire refreshed file, not a selected fragment or an old query tab.
   If 468/1750 recurs, stop and retain the full SQL error headers including
   procedure, line and batch-start line, and the corresponding SQL statement.
   The error numbers alone do not identify the failing constraint or batch.

5. Recheck `@@TRANCOUNT=0`, `XACT_STATE()=0`, history 1–7, the new 0006 checksum
   above, and the unchanged 0007 checksum. The pre-apply baseline script is not a
   post-apply success test: its checks intentionally expect 6/7 objects absent.
   Continue the staged setup below only after the owner verifies success.

The coding agent neither connected to SQL nor ended a transaction, applied a
migration, changed permissions, or deleted files/data during this recovery.

## Exact staged owner-run setup and verification

Use a **new disposable** `ct_password_auth_test`, authorized operator identity,
Node 24, npm 11.19.1 and local Mailpit bound to loopback (no relay/real email).
Do not run bootstrap on the previous disposable database containing accounts.
The coding agent runs only offline/build/isolated checks, not these SQL steps.

1. Set local environment, preserving the SQL server selected by the owner:

   ```powershell
   $env:SQL_DATABASE = 'ct_password_auth_test'
   $env:NODE_ENV = 'development'
   $env:ADMIN_AUTH_ORIGIN = 'https://localhost:3001'
   $env:AUTH_EMAIL_DELIVERY = 'development-preview'
   $env:ADMIN_SESSION_SECONDS = '43200'
   $env:ADMIN_AUTH_SECRET = (& node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")
   ```

   The assignment captures the secret without printing it. Use the same secret in
   the operator and development-server shells. Never put it in source or logs.

2. Review/apply migrations **0006/0007** after checksum validation of **0001–0005**.
   Stop the development server during cutover. All applied files remain unchanged.
   Review any existing credentialless AuthAccounts rows before applying the new
   credential-only constraint; the migration will not silently delete or invent
   passwords for unsupported rows. From the repository root:

   ```powershell
   npm.cmd run db:prepare-auth-verification:called-together -- --database ct_password_auth_test
   ```

   Review the guarded `build/auth-verification/ct_password_auth_test/00-apply.sql`
   generated under the app and have the owner run it with the authorized SQL
   client. Alternatively use the existing explicit db:migrate operator after
   db:status. Never edit checksums/history to force a cutover. Apply the reviewed
   narrow runtime permissions separately. No deployment runs migrations.

3. Create the first pending Administrator once:

   ```powershell
   npm.cmd run auth:bootstrap:called-together -- --email initial@example.invalid --name 'Initial administrator'
   npm.cmd run auth:bootstrap:called-together -- --email initial@example.invalid --name 'Initial administrator' --apply
   ```

   The first command is dry-run. The second sends only a safe-link notification
   to Mailpit. Repeat bootstrap, including simultaneous competing commands, must
   reject after one account is created. Verify one account/actor/Administrator
   assignment and one bootstrap event, without selecting any credentials.
   To test the empty-store bootstrap race, use a separate fresh disposable target
   and two configured operator shells: start competing `--apply` commands with
   distinct fictional addresses simultaneously. Exactly one may succeed and one
   pending Administrator/account/actor must remain. Use the winning address for
   the subsequent verifier; never repeat this race test against existing accounts.

4. In the same configured local environment, run the actual app:

   ```powershell
   $env:AUTH_INTEGRATION = '1'
   $env:AUTH_DEBUG = '1'
   npm.cmd run dev --workspace=called-together -- --experimental-https
   ```

   A local-only verification endpoint checks the _actual_ SQL DB_NAME against the
   explicit disposable name; it provides no authentication bypass or fixture API.
   It is 404 unless local development/configuration and AUTH_INTEGRATION=1 match.

5. In the operator shell, opt into verification of the **running routes**:

   ```powershell
   $env:AUTH_VERIFY_ADMIN_EMAIL = 'initial@example.invalid'
   $env:AUTH_VERIFY_ALLOW_SELF_SIGNED = '1'
   npm.cmd run auth:verify-sql:called-together -- --database ct_password_auth_test
   npm.cmd run auth:verify-sql:called-together -- --database ct_password_auth_test --run
   ```

   The first is dry-run with no network. The second uses the real form/CSRF,
   application services, SQL adapter and Mailpit. Self-signed acceptance applies
   only to that loopback verifier's requests, not runtime SQL TLS or global TLS.
   Passwords/codes/cookies remain in memory and are never printed. It activates
   the pending bootstrap account, creates an assigned account and a pending
   Administrator, tests setup/reuse/password login, refresh/session reads,
   recovery/revocation, private audit visibility, role changes, disablement,
   pending-admin exclusion, competing last-admin actions, audit events and logout.
   It is designed for one fresh disposable run, not repeated setup of an active
   account. Fixtures and immutable audit **remain for owner review**; it does not
   delete audit or pretend separate HTTP transactions can all roll back. The
   generated passwords are intentionally not retained; recover through Mailpit
   if further review needs login. The owner drops/recreates the disposable target
   only after review. Disable AUTH_INTEGRATION and AUTH_DEBUG afterward.

6. For notification failures, explicitly retry up to five pending notifications:

   ```powershell
   npm.cmd run auth:notify --workspace=called-together
   npm.cmd run auth:notify --workspace=called-together -- --run
   ```

   The first is dry-run. No startup bootstrap, default account, public recovery
   bypass, production email or external provisioning exists.

### Only account never activates

Do not rerun bootstrap or delete the account/actor. An authorized owner privately
reviews the selected target and sole pending account. The separate operator-only
recovery command renews that same invitation for seven days, re-enables it if
needed, records operator-attributed recovery/enable events atomically and retries
the safe-link notification. It refuses multiple accounts, any activated account
or an existing password credential, and shares the administration lock. It never
changes the email, sets a password, marks email verified or creates a session.
Runtime is denied EXECUTE on this procedure. The user still completes normal
setup. No public or startup recovery bypass exists.

```powershell
npm.cmd run auth:recover-pending --workspace=called-together -- --email initial@example.invalid
npm.cmd run auth:recover-pending --workspace=called-together -- --email initial@example.invalid --apply
```

## Validation evidence and limitations

Offline coverage uses actual HTTP route exports with Better Auth's password/
OTP primitives, SQL transaction/rollback driver fakes, installed MSSQL schema
introspection, real mssql/Tedious parameter validation, policy/migration checks,
and isolated production HTTP packaging smoke tests. In-memory library tests are
not SQL transaction/concurrency proof. Owner verification above must establish
real SQL schema compatibility, least-privilege execution, atomic audit writes,
concurrency, and Mailpit delivery. None is claimed owner-verified for 0006/0007.

Deployed email delivery remains unselected. `adminConfig` rejects production and
App Service environments; deployed authentication remains closed. This change
does not select/provision email, change Azure/Entra resources or grants, or
publish/deploy. Public articles/health remain anonymous and independent of auth.
