# Password runtime permission review

Proposed permissions, not applied or SQL-engine verified by the coding agent.
Use the existing `ct_password_auth_test` with its applied 0001–0007 history.
The November 11 owner-reported route pass used the earlier identity/permissions;
it does **not** establish that this restricted contract works. No migration changed.

Update recorded November 12, 2026: the owner confirmed restricted permission
status and all 30 probes passed in this database, with final transaction
count/state 0/0. Application readiness returned ready=true and
runtimeIdentityMatches=true. Audit-only continuation found all 15 required
historical event types and passed logout checks. These results are owner-reported;
the coding agent did not execute SQL. The continuation did not replay account
management or establish a fresh full restricted-identity scenario. See the
[authentication guide](../admin-auth.md) for the dated verification scopes.

## Operation matrix

`S/I/U/D` mean SELECT/INSERT/UPDATE/DELETE. UPDATE columns are exhaustive. INSERT
and DELETE are table permissions; SQL Server does not provide column INSERT grants.
The installed Better Auth version is 1.7.18. Reassess on upgrades or route changes.

| Operation                                                                               | Direct rights needed                                                           | Procedure rights / evidence                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find user, credential policy, password login, account list                              | AuthUsers S; AuthAccounts S; AuthInvitations S; AuthRoleAssignments S          | `credentials.ts`, `repository.ts`; installed `internal-adapter.mjs` finds user/accounts including credential hash                                                                                                                                        |
| Request/replace setup or reset code; reject wrong/expired/replayed code; atomic consume | AuthSetupVerifications / AuthVerifications S/I/D; **no U**                     | Installed email-OTP `resolveOTP` / `atomicVerifyOTP` and internal adapter consume: delete and recreate; hashed OTPs cannot enter the plain/encrypted reuse UPDATE branch                                                                                 |
| Finish first setup                                                                      | AuthAccounts S/I; AuthUsers U(emailVerified, updatedAt)                        | Installed `utils/password.mjs: resetCredentialPassword` creates credential; email-OTP reset explicitly verifies user, adapter adds updatedAt. AuthCompletePassword handles activatedAt, invitation acceptance and business audit through ownership chain |
| Reset existing credential                                                               | AuthAccounts S/U(password, updatedAt); AuthSessions S/D                        | Same helper updates password, deletes user sessions; AuthCompletePassword appends reset/revocation audit                                                                                                                                                 |
| Login/session creation                                                                  | AuthSessions S/I; AuthUsers/AuthAccounts S                                     | AuthBeginSession validates active account; AuthRecordSessionEvent appends login audit                                                                                                                                                                    |
| Page/API authorization, logout, expired-session cleanup                                 | AuthSessions S/D; user/invitation/role S                                       | AuthRecordSessionEvent for logout; reads use deferred cleanup, cookie cache and refresh are disabled; no direct session U needed                                                                                                                         |
| Create/enable/disable accounts, grant/revoke roles, revoke sessions                     | No direct AuthUsers I/D or U beyond library columns; no role/invitation writes | AuthManageAccount EXECUTE; same-owner static SQL writes users, actors, roles, invitations, outbox and audit atomically                                                                                                                                   |
| Send account-created safe-link notification                                             | AuthNotifications S/U(DeliveredAt); AuthUsers S                                | `notifications.ts`; no outbox I/D or U(UserId, CreatedAt)                                                                                                                                                                                                |
| Throttle attempts                                                                       | No direct AuthThrottleBuckets access                                           | AuthThrottle EXECUTE                                                                                                                                                                                                                                     |
| Rejection aggregates                                                                    | No direct AuthSecurityBuckets access                                           | AuthSecurityEvent EXECUTE                                                                                                                                                                                                                                |
| Administrator activity listing                                                          | No direct ActivityEvents/AuthAuditEvents access                                | AuthListActivity EXECUTE; validates SQL session and Administrator role                                                                                                                                                                                   |
| Operator bootstrap / pending recovery                                                   | **No runtime EXECUTE**                                                         | AuthBootstrapAdministrator / AuthRecoverPending remain operator-only                                                                                                                                                                                     |
| Anonymous articles                                                                      | Preserve existing dbo.PublicArticles SELECT                                    | No permission changes on this view or editorial objects                                                                                                                                                                                                  |

SELECT on library tables is table-wide because the installed adapter reads full
model projections. Credential INSERT permits the library-generated id, userId,
accountId, providerId, password, createdAt and updatedAt; applied constraints reject
noncredential/token-bearing rows. No direct credential DELETE or identity-field
UPDATE is needed. Metadata introspection uses visibility supplied by table rights;
the template adds no database-wide VIEW DEFINITION grant.

Source evidence: [application credentials](../../server/admin/credentials.ts),
[authorization repository](../../server/admin/repository.ts),
[library configuration](../../server/admin/auth.ts),
[notifications](../../server/admin/notifications.ts), and installed
`better-auth/dist/{plugins/email-otp/routes,plugins/email-otp/otp-token,utils/password,db/internal-adapter}.mjs`
plus `@better-auth/core/dist/db/get-tables.mjs` for updatedAt defaults.
`server/password-auth.test.ts` records field names from actual installed adapter
operations during setup/login/reset and asserts the reduced write contract.

## Trust and effective permissions

The runtime is a trusted credential/session processor, not a mutually untrusted
SQL tenant. Its direct password-hash UPDATE and credential INSERT can take over
existing users; session reads/inserts/deletes expose or replace authentication
state. It can also set emailVerified directly. None is scoped to one user by SQL
permissions. Verification-table access permits code-state tampering.
A direct credential/session write can bypass OTP and application audit hooks;
append-only protection preserves existing audit rows, not audit completeness.

Procedures validate supplied account/session state, but cannot prove which HTTP
caller supplied it. Runtime can read Administrator session IDs and call
AuthManageAccount with one; it can insert credentials and invoke password-completion
procedures without an independently attested OTP proof. Runtime compromise can
therefore exercise broad account authority despite blocking direct role/audit DML.
SQL permissions enforce the listed access paths, not end-user authorization or
tamper-proof audit against a fully compromised application. Preserve CSRF,
session possession, OTP/password policy and role checks in the application.

[The owner template](password-runtime-permissions.sql) defaults to preflight only.
It rejects fixed privileged/data roles, schema/object/principal ownership,
database/schema blanket rights, object CONTROL/ALTER/REFERENCES, impersonation,
grant options and excessive inherited auth column/object grants. It refuses to
repair other roles/principals implicitly. Legacy direct grants on the selected
user are replaced in one transaction. Object and column effective permissions
are checked after changes; any mismatch rolls back, and public-article SELECT
must equal its pre-apply value. Column DENYs explicitly cover forbidden columns
because a column GRANT can override an object DENY in SQL Server.

Owner `EXECUTE AS USER` is a database-context pre/postcheck, **not** a complete
simulation of a real login, server permissions or Microsoft Entra group token.
Run [the read-only status](password-runtime-permission-status.sql) and
[rolled-back probes](password-runtime-denial-probes.sql) using a genuinely
restricted connection. Status also checks effective server authority where
supported; unobservable server authority fails closed on non-Azure-SQL engines.
Owners must review Entra group inheritance and any unobservable server/cross-
database paths separately. No script proves absence of authority outside the
selected database/token. Do not test as dbo or assume three role-name checks suffice.

Permission references: [effective permission evaluation](https://learn.microsoft.com/en-us/sql/relational-databases/security/authentication-access/determining-effective-database-engine-permissions),
[column GRANT versus table DENY](https://learn.microsoft.com/en-us/sql/t-sql/statements/grant-object-permissions-transact-sql),
[permission-denial error numbers 229/230](https://learn.microsoft.com/en-us/sql/relational-databases/errors-events/database-engine-events-and-errors-0-to-999).

## One owner-run verification in the existing database

1. Select an **existing** restricted individual principal with connectivity to
   `ct_password_auth_test`. Review its login/Entra groups, nested role membership,
   ownership and server authority. Do not repurpose the developer/owner identity.
   If no suitable principal exists, stop; principal provisioning is separate owner
   work. As owner, review and replace the database/user placeholders in the grant
   template. Run @Apply=0 first. Resolve every rejected broad grant/ownership in a
   separate explicit owner review. Then review/run @Apply=1. Require
   GrantsCommittedAndPostcheckPassed=1. No migration/bootstrap/reset is needed.
2. Open a new SQL connection authenticated as that **actual restricted identity**.
   Replace only the expected-user placeholder in the status and probe scripts.
   Run status first: require EffectiveAuthContractPassed=1 and PublicArticleSelect=1.
   Then probes: require every Passed/AllPassed=1 and final transaction state/count
   0/0. Only permission errors 229/230 count as successful forbidden probes;
   business/constraint/immutable-trigger errors do not. Probes are zero-row DML or
   rolled-back operator calls, never print rows/parameters/raw errors, and never
   commit. Combine them with the effective column checks: a statement can require
   multiple permissions. Unexpected success or any other error means stop.
3. Run the local app in a **separate terminal/OS profile with the restricted Azure
   CLI identity**. Both pools use AzureCliCredential locally, not a SQL username
   setting. Use a separate AZURE_CONFIG_DIR and sign in interactively to Azure CLI
   as the selected existing restricted identity; do not copy the developer's CLI
   cache. Set AZURE_CONFIG_DIR in the app process and fully restart Next to discard
   its global mssql pool and Kysely pool. Point SQL_DATABASE to
   ct_password_auth_test and retain local HTTPS/Mailpit configuration. Do not set
   WEBSITE_* locally to select managed identity, and do not add credential fallbacks.
4. Set AUTH_INTEGRATION=1 and AUTH_VERIFY_RUNTIME_USER to the selected database
   user name in the **app** environment. The existing local-only verification route
   now checks USER_NAME in **both** real pools against that expected user, refuses
   dbo, and returns only runtimeIdentityMatches. Require ready=true and
   runtimeIdentityMatches=true before route tests. A verifier running in another
   terminal does not determine the web server's SQL identity. The separate actual-
   principal SQL status/probes remain required; the endpoint is an identity check,
   not a replacement effective-permission audit.
5. The previous full verifier leaves fixtures and may disable the original
   Administrator. As owner, privately identify an existing enabled, activated,
   verified Administrator with accepted invitation and credential; set
   AUTH_VERIFY_ADMIN_EMAIL to that account in the **verifier terminal**. Do not
   replay bootstrap. Set AUTH_VERIFY_CONTINUE_ACTIVE=1, leave
   AUTH_VERIFY_ADMIN_PAGE_ONLY unset, and run from the repository root:

   ```powershell
   npm.cmd run auth:verify-sql --workspace=called-together -- --database ct_password_auth_test --run
   ```

   This reuses normal reset/login (revoking that account's old sessions), then
   exercises account creation through AuthManageAccount, a fresh assigned account's
   setup, wrong/replayed setup/reset codes, login/session/page checks, notifications,
   reset revocation, role/disable/last-admin policy, activity and logout. Fresh test
   accounts/audit append to this **existing** database. Keep them for review. No
   cleanup/reset/new database. Require the full application HTTP/SQL/Mailpit pass.
   Run actual-principal status/probes again afterward. Unset verification flags.

The permission status/probe and historical audit/logout results above are now
owner-confirmed for this database. A fresh full restricted-identity scenario and
deployed verification remain unconfirmed; the procedure above is not a claim
that account management was replayed during audit-only continuation.
Offline tests cannot prove ownership
chaining, inherited/column permissions, Azure CLI identity or permission-denial
numbers on the owner's server.

## Deployment stages remain separate

1. **Code merge:** deployed authentication stays closed; there are no automatic
   migrations/grants/bootstrap at startup or in deployment. Merge alone does not
   enable authentication and is not authorized by this review.
2. **Email provider:** Resend is implemented with mocked delivery coverage; owner
   configuration and live receipt verification remain pending. Follow
   [the email guide](../../docs/email-delivery.md) for secret management, allowlist,
   retry limits and explicit deployed gates. Mailpit remains local only. Keep
   deployed authentication closed until separately owner-verified/authorized.
3. **Operator SQL:** owner reviews/applies required immutable migration history
   with a separate operator identity; bootstrap only for an explicitly reviewed
   empty account store. The already initialized test database needs neither.
4. **Runtime grants/live verification:** separately review the actual deployed
   runtime identity's effective rights, apply the transactional template only on
   explicit owner authorization, and repeat positive/negative route/SQL tests as
   that identity. Provider implementation and successful local grants do not
   establish deployed authentication or least-privilege readiness.
