# Anonymous published-article reads

`GET /api/articles` and `GET /api/articles/[slug]` are anonymous, read-only Node.js
route handlers. The application reuses the existing server-only lazy SQL pool:
Azure CLI developer credentials locally, system-assigned managed identity in App
Service. Only `dbo.PublicArticles` is queried, with explicit column projections.
SQL never runs during build/import, and homepage/health behavior remains independent
of SQL. There are no write endpoints, authentication flows, UI changes or seeds.

These are public endpoints, not permission checks for internal editorial data.
No browser SQL credentials, client secrets or public environment variables are
introduced. CORS is not authorization; no CORS restriction is used as an access
control. Public publication filtering is owned by the existing approved-revision,
non-archived SQL view. Application SQL has no base-table fallback.

## Request and response contract

Both routes are forced dynamic and all their JSON responses (including errors)
carry `Cache-Control: no-store`. There is no application result cache. The next
request queries the current view; publication changes between separate pagination
requests can shift offset pages. A stable snapshot/cursor is not provided.

The list accepts only `page` and `pageSize`, each at most once:

| Parameter  | Default | Allowed                                   |
| ---------- | ------- | ----------------------------------------- |
| `page`     | 1       | Canonical decimal integer 1 through 10000 |
| `pageSize` | 20      | Canonical decimal integer 1 through 50    |

Empty values, signs, leading zeros, fractions, exponent notation, unknown or
repeated parameters are rejected with HTTP 400. SQL uses typed `Int` parameters
for offset and fetch size, with at most 51 rows fetched and 50 returned. Ordering
is `PublishedAt DESC, ArticleId ASC`, so equal publication timestamps have a
unique deterministic tie-breaker. There is no unbounded total-count query.
`hasMore` indicates a fetched lookahead row; navigation is still subject to the
maximum page bound.

```json
{
  "items": [],
  "pagination": { "page": 1, "pageSize": 20, "hasMore": false }
}
```

Each list item is an explicit `PublishedArticleSummaryDto`: `id`, `slug`,
`language`, `title`, `summary`, UTC ISO `firstPublishedAt` and `publishedAt`, nullable
`sharingImageUrl`/`sharingImageAlt`, and a public `author` object with `id`, `slug`,
`displayName`, nullable `biography`, `photoUrl`, `photoAlt` and `affiliation`.
**Article body is neither selected from SQL nor returned by the list.**

Detail accepts no query parameters. Its decoded slug must match the existing
lowercase ASCII, single-hyphen-separated domain rule, maximum 160 characters.
It binds the slug as `VarChar(160)` rather than interpolating it into SQL.
The response is the same public summary object plus nullable `seoDescription`
and `body: { version: 1, format: "called-together.rich-text", content: {...} }`.
The stored body must parse and pass the domain envelope validator; unknown
root-envelope fields are omitted. No editor structure/HTML safety claim is made.
Future rendering must handle the body as untrusted structured content.

DTO mapping is an explicit allowlist. Actor identities, reviewer details, review
comments, submission state, rowversion, unpublished revisions and arbitrary SQL
row fields are not returned. A revision ID/number is not needed by this initial
public API contract.

| Result                                                           | HTTP | JSON                                                             |
| ---------------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| Valid list, including an empty database                          | 200  | `{ "items": [...], "pagination": {...} }`                        |
| Selected approved article found                                  | 200  | Public detail DTO                                                |
| Invalid query/slug                                               | 400  | `{ "error": "Invalid article request." }`                        |
| Missing, unpublished or archived detail                          | 404  | `{ "error": "Article not found." }`                              |
| SQL/configuration/permission failure or unusable stored envelope | 503  | `{ "error": "Published articles are temporarily unavailable." }` |

Driver messages, server configuration, tokens and stored content are not logged
by the handlers or reflected in error responses. Invalid requests are rejected
before acquiring the pool. Permission failures are not disguised as an empty list
or 404; they return 503. The SQL pool remains reusable across requests.

## Owner-granted permission and current verification status

The project owner reports **manually granting SELECT on `dbo.PublicArticles` to
`[called-together-dev-ec76]` in `sqldb-called-together-dev`**. The coding agent did
not run that grant, alter applied migrations, change runtime roles or connect to
live SQL. Do not grant broad schema-admin/db_owner privileges or base-table reads
for these endpoints.

**Effective SELECT access from the deployed app's managed identity and successful
live API access remain unverified.** Earlier owner-performed schema/migration
tests are not evidence of either. The following steps are manual verification
instructions, not actions performed as part of implementation.

## Local developer verification (contacts SQL only when you run these steps)

From the repository root in a local PowerShell session, use Node.js 24/npm
11.19.1 and the existing authorized Entra developer account/network access:

```powershell
az login --tenant '<sql-tenant-id>'
az account set --subscription '<development-subscription-id>'
$env:SQL_SERVER = 'sql-called-together-dev-ec76.database.windows.net'
$env:SQL_DATABASE = 'sqldb-called-together-dev'
npm.cmd run verify:public-articles --workspace=called-together
```

Expected exit 0 and:

```text
PublicArticles SELECT verification succeeded (zero rows is valid).
```

This extends the existing packaged `verify-sql.js` operator with
`--public-articles`. It selects TOP (1) with all API-required public columns, logs
neither rows/content nor tokens, accepts zero rows, and closes its pool on success
or failure. Default `verify:sql` still runs `SELECT 1` only; that check does not
establish view permissions. Local verification uses Azure CLI identity and **does
not verify the deployed managed identity**.

Start the app from that same configured terminal:

```powershell
npm.cmd run dev:called-together
```

In another local terminal:

```powershell
curl.exe -i 'http://localhost:3001/api/articles?page=1&pageSize=20'
curl.exe -i 'http://localhost:3001/api/articles/not-a-published-article'
curl.exe -i 'http://localhost:3001/api/articles?page=0'
curl.exe -i 'http://localhost:3001/api/health'
```

With the development view empty, expect respectively 200 with the empty-list
JSON above, 404, 400, and health 200. All article responses must contain
`Cache-Control: no-store`. A valid list returning 503 is a failed SQL/configuration/
permission check, not the expected empty-database result. When real approved
content exists, verify a known slug returns its public detail and remains absent
from the list body payload; do not seed fake content to complete this step.

## Local build/package verification (no Azure access)

```powershell
npm.cmd run format
npm.cmd run format:check
npm.cmd run lint
npm.cmd run check-types
npm.cmd test
node --test scripts/deployment-decisions.test.mjs
npm.cmd run build:azure
npm.cmd run build-storybook
npm.cmd run package:called-together
npm.cmd run verify:called-together
```

Builds do not fetch SQL. The isolated verifier starts the standalone server with
no SQL settings/credentials, checks repeated health and homepage/assets, and
asserts article requests return sanitized no-store 503s while invalid requests
return 400. It checks article routes are not prerendered and both operator modes
fail safely with configuration errors before network access. Unit tests mock the
SQL boundary and cover successful lists/details, public DTOs, paging, validation,
404, content-envelope failures and database unavailability without Azure.

## Deployment through the existing protected workflow

After review, commit/push a feature branch and open a PR through the normal
repository process. This implementation task does not do those actions. Once the
owner approves merging to protected `main`, the existing **Validate and Deploy**
workflow builds, packages and smoke-tests, then deploys Called Together according
to deployment selection. For an explicitly requested manual deployment, use
GitHub Actions -> Validate and Deploy -> Run workflow -> branch `main` ->
`deploy_target = called-together`. Do not deploy directly from an unreviewed local
working tree or change Azure roles/startup/deployment configuration.

Confirm that Validate and Deploy Called Together succeeded for the intended
commit, and that the running app is configured with the existing SQL_SERVER and
SQL_DATABASE server-side settings. The standalone artifact includes the compiled
SQL operator and its view-query projection. No migration, grant or database seed
runs during deployment, build or app startup.

## Live managed-identity verification (run inside the application container)

Use **Azure Portal -> called-together-dev-ec76 -> SSH** into the running App
Service Linux application container. Cloud Shell, your laptop and SCM/Kudu are
not substitutes for the application's system-assigned identity context.

```sh
cd /home/site/wwwroot/apps/called-together
node --conditions=react-server build/sql/operators/verify-sql.js --public-articles
printf 'Exit status: %s\n' "$?"
```

Expected: the success message above and exit status 0, even with an empty view.
Any nonzero result leaves access unverified: review server settings, identity,
network/firewall and the existing view grant with an authorized operator. Do not
print tokens or add broad runtime grants as a troubleshooting shortcut.

Finally, from your local terminal, test the deployed public HTTP endpoints:

```powershell
$LiveBase = 'https://called-together-dev-ec76-gyfufcfwg9etchgs.centralus-01.azurewebsites.net'
curl.exe -i "$LiveBase/api/articles?page=1&pageSize=20"
curl.exe -i "$LiveBase/api/articles/not-a-published-article"
curl.exe -i "$LiveBase/api/articles?page=0"
curl.exe -i "$LiveBase/api/health"
```

With an empty view expect 200/empty list, 404, 400 and health 200. Check no-store
headers on both success/error article responses. Record the deployment commit,
operator exit code and HTTP statuses without content/tokens before marking live
view/API access verified. No write, authentication or CORS workaround is needed.
