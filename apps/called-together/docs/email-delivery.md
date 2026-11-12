# Called Together email delivery

Resend is implemented but **not configured or owner-verified in deployment**.
Authentication stays closed by default. No migration, grant, bootstrap or resource
change accompanies this implementation. Existing accounts and audit remain intact.
The November 12 restricted-permission/historical-audit results in
[the authentication guide](../database/admin-auth.md) remain separate evidence;
they do not establish Resend delivery, a fresh full scenario or deployed readiness.

## Owner verification record — November 12, 2026

The owner reported the following targeted local results using the existing
`ct_password_auth_test` database:

- A real authentication code arrived in the Resend account's Gmail inbox.
- Sign-in succeeded, as reported by the owner.
- The session API returned the authenticated Administrator.
- After logout, the session API returned `Authentication required`.

These are owner-run observations, not email or SQL checks performed by the coding
agent. Actual inbox receipt was observed separately from provider acceptance.
This was **targeted local verification**, not a full account-management scenario,
a fresh permission verification, or proof of deployed readiness. The earlier
temporary-unavailable response remains **unexplained**; the later successful
observations do not establish its cause or prove that it cannot recur.

Deployed authentication remains disabled pending separate explicit configuration,
owner authorization and deployed verification. No deployed enablement, SQL,
permissions, fixtures or Azure resources were changed for this record.

## Settings and server boundary

Use `apps/called-together/.env.local` locally (ignored by Git); use **App Service
Environment variables / App settings** for the Called Together server in deployment.
Never use `NEXT_PUBLIC_`, source control, browser configuration, command-line key
arguments or deployment artifacts for secrets. The server reads settings at runtime;
builds need no Resend key. Delivery/config modules import `server-only`.

| Setting                          | Value / meaning                                                                                                                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_EMAIL_DELIVERY`            | Explicit `development-preview` for Mailpit or `resend`; unset/unknown fails closed.                                                                                                                                                           |
| `RESEND_API_KEY`                 | Private sending API key entered by the owner; required only for Resend. Never print it.                                                                                                                                                       |
| `AUTH_EMAIL_FROM_ADDRESS`        | Initially `onboarding@resend.dev`; later an address on a Resend-verified domain. Required for Resend.                                                                                                                                         |
| `AUTH_EMAIL_FROM_NAME`           | `Called Together` (required for Resend; plain display name, no header/control characters).                                                                                                                                                    |
| `AUTH_EMAIL_RECIPIENT_ALLOWLIST` | Optional comma-separated exact email addresses, compared case-insensitively. No wildcard/domain entries. Omit entirely for no application allowlist. Empty/malformed configuration fails closed. Recommended for all development deployments. |
| `ADMIN_AUTH_ORIGIN`              | Exact HTTPS origin, locally `https://localhost:3001`, deployed `https://YOUR-APPROVED-HOST`; no path/query.                                                                                                                                   |
| `ADMIN_AUTH_SECRET`              | Existing environment-specific 32-byte unpadded base64url secret; preserve it for existing accounts/sessions. Never print it.                                                                                                                  |
| `ADMIN_SESSION_SECONDS`          | Optional, default `43200`, range `3600`–`604800`.                                                                                                                                                                                             |
| `ADMIN_AUTH_ENABLED`             | Default unset/`0`. Deployed Resend requires exactly `1`.                                                                                                                                                                                      |
| `ADMIN_AUTH_OWNER_VERIFIED`      | Default unset/`0`. Deployed Resend also requires exactly `1`, an explicit owner attestation after the review below. This is a gate, not automated proof.                                                                                      |

Mailpit remains restricted to `NODE_ENV=development`, HTTPS localhost/127.0.0.1,
and absence of `WEBSITE_SITE_NAME` / `WEBSITE_INSTANCE_ID`. Deployed Mailpit is
refused even if both gates are set. Local Resend uses the same local boundary;
production/nonlocal environments require both gates. Neither provider changes
invitation eligibility, password/OTP policy, roles, session liveness/revocation or
last-active-Administrator protection. SQL rights never replace those checks.

## Local owner setup and verification

1. Keep the existing SQL identity/target and accounts. Do not rerun bootstrap,
   reset the database, delete fixtures or reapply migrations for this change.
   Confirm the existing `.env.local` SQL settings privately. Never paste it into logs.
2. For Mailpit, retain `AUTH_EMAIL_DELIVERY=development-preview` and the existing
   loopback Mailpit service at `http://127.0.0.1:8025`. No Resend settings are needed.
3. To test Resend instead, create a sending API key in the owner's Resend account
   and enter it privately as `RESEND_API_KEY` in
   `apps/called-together/.env.local`. Set:

   ```dotenv
   AUTH_EMAIL_DELIVERY=resend
   AUTH_EMAIL_FROM_ADDRESS=onboarding@resend.dev
   AUTH_EMAIL_FROM_NAME="Called Together"
   AUTH_EMAIL_RECIPIENT_ALLOWLIST=YOUR-RESEND-ACCOUNT-EMAIL
   ADMIN_AUTH_ORIGIN=https://localhost:3001
   ADMIN_AUTH_ENABLED=0
   ADMIN_AUTH_OWNER_VERIFIED=0
   ```

   Replace the allowlist placeholder privately with the email associated with
   the Resend account. Keep the existing `ADMIN_AUTH_SECRET`; do not replace it
   with an example. Do not set `NODE_ENV=production` for this local test.

4. From the repository root, using Node 24 / npm 11.19.1:

   ```powershell
   npm.cmd run dev --workspace=called-together -- --experimental-https
   ```

   Trust the local development certificate through the existing owner procedure.
   Restart the server after environment changes. Only proceed with real sends
   when the owner explicitly chooses to do so.

5. Use an **existing eligible account whose actual address is the Resend account
   email**. If none exists, stop; the owner must arrange an authorized invitation
   through the existing administration flow. Never change/redirect a code's recipient.
   For an active account use `/admin/reset`, receive its code, complete password
   recovery and sign in at `/admin/login`. For an already invited pending account
   use `/admin/setup`. Verify the actual inbox separately from provider acceptance,
   then `/api/admin/session`, `/admin` and logout/session rejection. Recovery
   revokes previous sessions; this is an intentional owner-run account operation.
   Do not run the full Mailpit verifier against Resend: its fixture addresses and
   Mailpit inbox inspection are unsuitable for the restricted test sender.
6. Test a disallowed address only with owner authorization: no send should occur,
   responses remain generic and no code is redirected. Offline mocked tests cover
   this without exposing accounts. Do not use another person's address to test.

Resend's `onboarding@resend.dev` test sender can send **only to the address
associated with the Resend account**. An application allowlist does not override
that restriction or make a new account eligible. A multi-account fresh full
scenario needs a verified custom domain and approved recipients.
[Official test-sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Later App Service owner configuration (not performed by this change)

1. Keep `ADMIN_AUTH_ENABLED=0` and `ADMIN_AUTH_OWNER_VERIFIED=0` while staging
   configuration. Code merge/deployment alone must leave authentication closed.
2. In the Called Together App Service's **Environment variables / App settings**,
   privately add `RESEND_API_KEY` as a secret (or an owner-managed Key Vault
   reference). Set the Resend provider/from/name/allowlist settings above,
   `ADMIN_AUTH_ORIGIN` to that app's exact HTTPS origin, the existing private
   `ADMIN_AUTH_SECRET`, and optional session duration. Use `NODE_ENV=production`.
   No `.env.local` is shipped. Keep `AUTH_DEBUG` and `AUTH_INTEGRATION` unset/`0`.
   Retain the existing server startup, SQL settings and managed identity; do not
   substitute a database-owner identity. Azure resource/permission changes are
   a separately authorized owner task, not needed to configure this transport.
3. Before any enablement, the owner verifies local Resend receipt, allowed
   recipients, existing migration history, operator initialization state and the
   **actual deployed runtime principal's** effective least-privilege rights using
   [the existing permission procedure](../database/verification/password-runtime-permissions.md).
   Local success does not prove deployed permissions. No startup/deployment SQL.
4. Only under explicit owner authorization, use an approved restricted validation
   deployment, set both gates to `1` as an owner attestation to the reviewed
   prerequisites, save/restart, and repeat the targeted existing-account checks
   in step 5 above at that exact origin. This enables auth on that deployment;
   it is not safe to treat the flag as a test with no exposure. Confirm actual
   inbox receipt, session API/admin page, reset revocation, roles and logout.
   Keep the test-sender allowlist to the Resend account address. On failure set
   `ADMIN_AUTH_ENABLED=0` and restart; do not broaden rights or rerun setup blindly.
5. Production enablement requires separate explicit owner approval and live
   verification. Until then leave production gates `0`, even after validation
   elsewhere. Record acceptance and inbox evidence separately, without secrets.

## Verified custom domain: configuration-only switch

The owner adds/verifies a domain in Resend and completes its required DNS records
through a separately approved operation. Then set `AUTH_EMAIL_FROM_ADDRESS` to
the approved mailbox on that domain, change `AUTH_EMAIL_FROM_NAME` if desired,
and update/omit the allowlist only after reviewing intended recipients. Adjust
API-key scope if required. Restart and owner-verify actual receipt again. No
template, authentication, database or application code change is needed.
[Official domain documentation](https://resend.com/docs/dashboard/domains/introduction).

## Acceptance, retries and outbox limits

The existing `EmailDelivery` interface/templates serve both transports. The
Resend implementation uses [POST /emails](https://resend.com/docs/api-reference/emails/send-email),
server-side Bearer authorization, plain text and a five-second timeout with
redirects refused. No SDK retries, automatic loops, background worker, webhook or
delivery-confirmation claim are added. Provider rejection/network/timeout errors
become a fixed safe error with no raw cause/body. Local AUTH_DEBUG can report the
allowlisted `email_delivery / resend_send` operation and `email_delivery_unavailable`;
debug remains disabled on App Service. Never log request/response contents or keys.

Each OTP send has a fresh opaque idempotency key and a single attempt; a new
user request goes through existing throttling and generates a new code. Codes
are not added to the notification outbox. After a timeout the owner/user cannot
infer non-delivery; avoid repeated requests and use only the latest valid code.

Account-created safe-link notifications retain the existing outbox: at most five
pending rows per explicit invocation, sequential attempts, stop on first failure,
and update `DeliveredAt` **only after provider acceptance**. The historical column
name means accepted/submitted, **not inbox delivery**. SQL-update failure after
acceptance leaves a pending row. Resend gets a stable hashed outbox user identifier
as the idempotency key, shared by concurrent/explicit retries. No address/code is
included in that key. Identical payloads are deduplicated for Resend's **24-hour**
window. An operator renewal of the same pending invitation shares this key;
the unchanged credential-free notice can be deduplicated during that window.
Changed sender/origin/template payload with the same key can receive a conflict;
do not bypass this by generating a new key during retries.
[Official idempotency contract](https://resend.com/docs/dashboard/emails/idempotency-keys).

There is no new durable attempt ledger or exactly-once guarantee. Beyond 24 hours,
provider deduplication expires; after an ambiguous failure the owner must privately
review Resend acceptance before retrying. Do not schedule repeated notification
commands or retry a batch blindly. Mailpit has no provider deduplication. Review
pending safe-link notices privately before authorizing the existing command:

```powershell
npm.cmd run auth:notify --workspace=called-together
# Dry-run above: no SQL/email. The following is an explicit real SQL/send operation:
npm.cmd run auth:notify --workspace=called-together -- --run
```

Do not run `--run` against an old mixed-recipient outbox with the test sender;
disallowed recipients fail rather than redirect, and block the batch at that row.
Use authorized account-specific flows for a targeted test. No fixtures are deleted.

Mocked transport/outbox regression tests are in
`apps/called-together/server/resend-delivery.test.ts`; the existing authentication
and policy tests continue to cover supported account operations. No real email,
SQL or provider account access is part of those tests.
