# Starweave

Starweave is a generic Turborepo monorepo for independent applications, each
with its own pages and deployment. It includes two independent Next.js App Router
applications, Storybook, and shared Material UI components in `packages/ui`.

| Application            | Workspace         | Purpose                               | Development port |
| ---------------------- | ----------------- | ------------------------------------- | ---------------- |
| `apps/web`             | `web`             | Existing experimentation/test website | 3000             |
| `apps/called-together` | `called-together` | Called Together ministry website      | 3001             |
| `apps/storybook`       | `@repo/storybook` | Shared component catalog              | 6006             |

Both websites may use `@repo/ui`. Called Together keeps its ministry content,
components, and independent Material UI theme inside `apps/called-together`.
It contains a homepage and a request-time health endpoint, with a separate
App Service Linux deployment job in the existing workflow.

Repository: [ec76/starweave](https://github.com/ec76/starweave).

## Local setup

Use Node.js 24 (the repository supports `>=24`; CI selects 24) and exactly
npm 11.19.1, as required by `devEngines.packageManager`. For a fresh clone:

```sh
git clone https://github.com/ec76/starweave.git
cd starweave
npm ci
```

Start both website development servers:

```sh
npm run dev
```

The test site is available at [http://localhost:3000](http://localhost:3000)
and Called Together at [http://localhost:3001](http://localhost:3001).
Start just one with `npm run dev:test` or `npm run dev:called-together`.
Start the component catalog separately with `npm run storybook`.

## Commands

Run these from the repository root:

```sh
npm run dev
npm run dev:test
npm run dev:called-together
npm run build
npm run build:called-together
npm run package:called-together
npm run verify:called-together
npm run lint
npm run check-types
npm run storybook
npm run build-storybook
npm run build:azure
npm run format
npm run format:check
npm test
npm run test:watch
npm run test:coverage
```

Storybook runs at [http://localhost:6006](http://localhost:6006). The static
build is written to `apps/storybook/storybook-static`.

`npm run build` builds both websites. Each can also build independently:
`npm run build:azure` targets only `web` and its dependencies, while
`npm run build:called-together` targets only `called-together` and its dependencies.
Both transpile `@repo/ui`. The test website retains Next.js static export in
`apps/web/out`; serve that directory with a static file server for production preview.
Called Together uses Next.js standalone server output in
`apps/called-together/.next/standalone` and requires a Node.js server.
The existing Azure workflow deploys `apps/web/out` to its Static Web App and
the validated Called Together standalone package to its separate App Service,
subject to the selective deployment decisions documented below.

## Called Together: App Service Linux deployment

The intended target is separate from the existing Static Web App:

| Setting        | Target                                                                           |
| -------------- | -------------------------------------------------------------------------------- |
| Web App        | `called-together-dev-ec76`                                                       |
| Resource group | `rg-called-together-dev`                                                         |
| Runtime        | Node 24 LTS on Linux                                                             |
| URL            | https://called-together-dev-ec76-gyfufcfwg9etchgs.centralus-01.azurewebsites.net |

The existing `Validate` check name and `apps/web` deployment are preserved.
The separate `Deploy Called Together` job requires successful validation and
an affirmative deployment decision. These instructions do not confirm that the
Azure identity, permissions, runtime, or deployment have been verified live.

From the repository root, using Node.js 24 and npm 11.19.1:

```sh
npm ci
npm run package:called-together
npm run verify:called-together
```

Packaging first runs the filtered application build and its required workspace
dependencies. The Node.js packaging script then replaces only
`artifacts/called-together`, copying the full traced standalone tree without
flattening it. `outputFileTracingRoot` points to the monorepo root so dependencies
outside the app can be traced. The package includes runtime dependencies and hidden
Next.js files. Internal links are dereferenced for relocation; links outside the
source tree are rejected. Environment files, credential files such as `.npmrc`,
private-key files, and other applications are excluded. Keep secrets out of source,
public assets, and build-time JavaScript; copying filters cannot remove values
already embedded in compiled code.

The resulting layout is:

```text
artifacts/called-together/
  node_modules/                       # traced runtime dependencies
  apps/called-together/
    server.js                         # generated Next.js entry point
    package.json
    .next/                            # server build and manifests
      static/                         # copied browser JS/CSS assets
    public/                           # copied only when present
```

Additional traced workspace files retain their generated relative paths.
Generated artifacts are ignored by Git and Prettier. Do not deploy the repository,
the static `out` directory, or only the nested application directory. The
deployment uploads the **contents** of `artifacts/called-together` to
`/home/site/wwwroot`, including dotfiles and `node_modules`, and preserve this
layout. Build on Linux for the Linux target so any native dependencies match the
runtime. Deployment uses the prebuilt package without an Azure/Oryx rebuild or
runtime npm installation.

The exact Azure Linux startup command, from `/home/site/wwwroot`, is:

```sh
HOSTNAME=0.0.0.0 node apps/called-together/server.js
```

The generated server reads Azure's `PORT` environment variable; do not hardcode it
in the startup command. Explicit `HOSTNAME=0.0.0.0` overrides the container hostname
and binds all interfaces. This follows the [Next.js standalone server guidance](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
and [Azure Node.js port requirements](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs).
For a manual local preview, change into `artifacts/called-together` and run:

```sh
HOSTNAME=0.0.0.0 PORT=3001 node apps/called-together/server.js
```

In PowerShell, set `$env:HOSTNAME = "0.0.0.0"` and `$env:PORT = "3001"`, then run
`node apps/called-together/server.js` from the artifact root. Stop with Ctrl+C.

`npm run verify:called-together` works on Windows and Linux. It copies the package
to a fresh OS temporary directory outside the checkout, checks that Next.js resolves
inside the copy, and starts the generated server with a clean environment,
`HOSTNAME=0.0.0.0`, and a temporary `PORT`. It checks the homepage, referenced
JavaScript and CSS (including response bytes), optional public assets, and repeated
`GET /api/health` responses. Health returns only `{"status":"ok"}` with `no-store`;
the route is forced dynamic and the verifier checks it is not prerendered.
It also checks uncached article API validation and generic 503 responses with no
SQL settings, and verifies both SQL operator modes fail safely before connecting.
The verifier stops the process and deletes its temporary directory on success or
failure. It does not rely on the checkout's `node_modules`. It is an HTTP smoke
test, not a browser hydration or visual test.

The Linux `Validate` job builds, packages, and smoke-tests Called Together using
the pinned Node/npm setup. It then archives the exact smoke-tested folder with
`tar -czf ... -C artifacts/called-together .` and uploads `called-together.tar.gz`
with `actions/upload-artifact@v7` using `archive: false`. Tar retains hidden files,
directory layout, symlinks, and permissions during transfer between jobs. The
packager already dereferences internal runtime links; tar does not dereference
links or flatten the resulting package. This follows GitHub's
[artifact permission guidance](https://github.com/actions/download-artifact#maintaining-file-permissions).

`Deploy Called Together` downloads by the immutable artifact ID from Validate
using `actions/download-artifact@v8`, checks the archive SHA-256 against the
validation job's output, and extracts with permissions preserved. It verifies
the nested server, static directory, and Next.js runtime exist. It does not check
out source, reinstall dependencies, or rebuild. It uses `azure/login@v3` with
these existing GitHub repository **variables**, not secrets:

- `CALLED_TOGETHER_AZURE_CLIENT_ID`
- `CALLED_TOGETHER_AZURE_TENANT_ID`
- `CALLED_TOGETHER_AZURE_SUBSCRIPTION_ID`

Only this job receives `contents: read` and `id-token: write`. It has no GitHub
environment because the configured Azure federated subject is
`repo:ec76/starweave:ref:refs/heads/main`. Adding an environment would change that
subject and require a matching Azure trust configuration. See
[Azure Login's OIDC guidance](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended).

The job explicitly sets `SCM_DO_BUILD_DURING_DEPLOYMENT=false` and
`ENABLE_ORYX_BUILD=false` on this Web App, with setting values suppressed from
logs, then deploys the extracted folder using `azure/webapps-deploy@v3`.
Its `startup-command` input sets the exact Linux command above. No publish
profile, client secret, or Static Web App token is used by this job. The
existing Static Web App job retains its own token and `web-static` artifact.

After deployment, up to 18 attempts check both `/api/health` for successful JSON
containing `status: "ok"` and `/` for a successful response containing
`Called Together`. Each HTTP request has a 5-second connection timeout and
10-second total timeout, with 5 seconds between failed attempts. The verification
step has an 8-minute ceiling and fails the deployment job if readiness never
passes. A failed verification does not automatically roll back the deployed app.

### Called Together deployment troubleshooting

- **Login fails:** check all three repository variables, the main-branch run,
  the job's `id-token: write`, and the exact federated subject above. Do not
  assign a GitHub environment to this job with the current branch trust.
- **Authorization fails:** the existing identity needs permission on
  `called-together-dev-ec76` in `rg-called-together-dev` to deploy content and
  update app settings/startup configuration. Check its Azure role assignment;
  no role or identity is created by this workflow.
- **Missing artifact or checksum mismatch:** inspect Validate's packaging,
  smoke-test, archive, and upload steps. Rerun the complete workflow if its
  artifact has expired. The deployment job deliberately has no build fallback.
- **Startup fails or readiness times out:** inspect App Service **Log stream**
  and deployment logs. Confirm Node 24 LTS on Linux, the nested
  `apps/called-together/server.js` under `/home/site/wwwroot`, the configured
  startup command, and both remote-build settings set to false. Do not replace
  Azure's `PORT` with a fixed port or bind only to localhost.
- **Health passes but homepage fails:** inspect the server logs and confirm
  the deployment retained `.next`, its static assets, and runtime dependencies.
  App Service access restrictions or authentication can also block the public
  GitHub-runner verification requests.

Local checks cannot establish that OIDC login, Azure role permissions, deployment,
startup settings, or public readiness work. These require a live GitHub run on
`main`; this documentation does not claim the target has been deployed.

## Called Together: private Azure SQL connectivity

SQL connectivity lives in `apps/called-together/server/database.ts`, marked
`server-only`. Import it only from server code running in the Node.js runtime,
never Client Components or Edge code. The anonymous article APIs query only
`dbo.PublicArticles` through the server read model; the homepage and `/api/health`
remain independent of SQL. See the
[article API guide](apps/called-together/database/published-articles.md). Importing
the module or building the app does not read SQL settings, authenticate, or open a connection.
CI requires no SQL settings, Azure credentials, or database access.

On first use, the module reads `SQL_SERVER` and `SQL_DATABASE` from the server
environment. In App Service (`WEBSITE_INSTANCE_ID` / `WEBSITE_SITE_NAME`), it uses
a direct, system-assigned `ManagedIdentityCredential`, without a client ID or
client secret. Locally it uses `AzureCliCredential` with a 10-second CLI process
timeout. These credentials are supplied through Tedious's supported
[`token-credential` authentication](https://tediousjs.github.io/tedious/api-connection.html),
which requests a token for each new physical connection. The application does
not store a bearer token in the pool configuration; credential-library caching
respects token expiry. The App Service runtime identity is separate from the
OIDC identity used by GitHub deployment.

Connections require TLS encryption with server certificate validation. The
lazy pool has a maximum of 3 connections, minimum 0, and a 30-second idle timeout.
Connection and query timeouts are 15 and 10 seconds, pool acquisition/creation
timeouts are 20 seconds, and cancellation/destruction timeouts are 5 seconds.
Concurrent callers share initialization; failed initialization closes and clears
the failed pool so a later call can retry. The holder survives development module
reloads. Article handlers call the server read model only at request time. No
schema migrations, table creation or database grants run in request handlers.

### Editorial schema and manual migrations

Version-controlled editorial tables, revision/publication types, manual migration
commands and the opt-in disposable SQL verification procedure are documented in
[the Called Together database guide](apps/called-together/database/README.md).
Migrations require an authorized developer identity and explicit `--apply`;
ordinary builds, startup and deployments never apply schema changes. The runtime
managed identity receives no schema-administration permissions.

### Local operator verification

Use Node.js 24 and npm 11.19.1. Copy `apps/called-together/.env.example` to
`apps/called-together/.env.local` and replace the placeholders. The example is
tracked; real environment files remain ignored. Do not prefix SQL settings with
`NEXT_PUBLIC_`, put tokens/passwords in these files, or copy App Service managed
identity endpoint/header settings to a developer machine.

For this development target, the server is
`sql-called-together-dev-ec76.database.windows.net` and the database is
`sqldb-called-together-dev`. Log in to the database's Entra tenant with Azure CLI:

```sh
az login --tenant <sql-tenant-id>
az account set --subscription <development-subscription-id>
npm run verify:sql --workspace=called-together
```

Run npm from the repository root. It compiles the command and loads the app's
`.env.local` (existing environment values take precedence). The logged-in user
must already have an Entra database identity and permission to connect. Azure SQL
must permit the developer's current public outbound IP, and local networking must
allow SQL traffic on port 1433. The App Service outbound-IP firewall entries do
not permit a developer's laptop automatically. Arrange local firewall access
with the operator; this change adds no firewall rules or database permissions.

### Verify the deployed App Service identity

Open **SSH into the application's running App Service Linux container**, then run:

```sh
cd /home/site/wwwroot/apps/called-together
node --conditions=react-server build/sql/operators/verify-sql.js
```

The compiled entry point uses the same database implementation as application
server code. `--conditions=react-server` enables the Node resolution condition for
the `server-only` marker; the command is private and is not an HTTP endpoint.
It uses the container's `SQL_SERVER`, `SQL_DATABASE`, and managed identity
environment, runs only `SELECT 1 AS ok`, closes its pool, prints
`SQL verification succeeded: ok=1.`, and exits zero. Failures exit nonzero with
sanitized configuration/authentication/network/timeout diagnostics. Raw driver
errors, tokens, credential headers, and full connection settings are never printed.

The configured runtime principal is `644d0c08-c23e-4c4f-bf2d-0b6cf382ca1d`, with
database user `called-together-dev-ec76` (`EXTERNAL_USER`). This is a principal
object ID, not a user-assigned identity client ID; do not pass it to the credential.
No table permissions are required for this probe, and none are added here.
**Cloud Shell, a GitHub runner, or the separate SCM/Kudu container does not verify
the Web App application's managed identity.** Live database access remains
unverified until the command succeeds in the running application container.

Every Called Together build compiles the private operator and shared SQL module
into `build/sql`. Packaging explicitly traces the compiled operator with
`@vercel/nft` and adds its runtime dependencies to the existing standalone tree,
since no Next route references it. Turbo caches the compiled output. The existing
isolated artifact verifier checks local dependency resolution and invokes the
packaged command **without SQL settings**, requiring a sanitized configuration
failure before any network access. Existing homepage/assets/health checks remain
in place. Mocked SQL tests run through `npm test`; they do not call Azure or SQL.
Selective deployment conditions and Azure deployment authentication are unchanged.

### MSAL Node advisory review (2026-10-29)

**Verified installed dependency:** `npm explain @azure/msal-node` and `npm ls`
report `@azure/msal-node@6.0.1`. This is within the affected range
`>=5.0.0-beta.0 <7.1.0` for
[GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5).
The advisory concerns the authorization-code flow and `acquireTokenByCode`;
MSAL Node 7.1.0 and later contain the patch. The installed package remains
affected even though the configured SQL credential flows differ from that API.

The installed paths are:

```text
called-together -> @azure/identity@4.14.0 -> @azure/msal-node@6.0.1
called-together -> mssql@12.7.13 -> tedious@20.3.8
                -> @azure/identity@4.14.0 -> @azure/msal-node@6.0.1
```

`@types/mssql@12.3.0` also references the same deduplicated Tedious installation
as a development dependency. Removing that type dependency would not remove
either runtime path above.

**Verified update availability:** npm registry metadata on the review date shows
the installed parents are their current stable `latest` releases:

| Parent            | Stable version | Declared next dependency        |
| ----------------- | -------------- | ------------------------------- |
| `mssql`           | 12.7.13        | `tedious: ^19.2.2 \|\| ^20.0.0` |
| `tedious`         | 20.3.8         | `@azure/identity: ^4.13.1`      |
| `@azure/identity` | 4.14.0         | `@azure/msal-node: ^6.0.0`      |

MSAL Node's latest release is 7.1.2, but Azure Identity's declared `^6.0.0` range
excludes it; the newest published MSAL 6 release is the installed 6.0.1. The
available Azure Identity 4.15.0-beta.1 also declares `^6.0.0` and is a prerelease,
so it supplies no patched-parent option. No compatible supported parent update
was found. No dependencies were changed for this review, no `npm audit fix --force`
was run, and no MSAL major-version override is applied.

**Verified configured source paths:** `server/database.ts` explicitly selects
`ManagedIdentityCredential` in App Service or `AzureCliCredential` locally and
passes the credential through Tedious's `token-credential` authentication.
Installed Tedious calls `credential.getToken` on connection authentication.
Source inspection of both Azure Identity's ESM and CommonJS implementations shows:

- Managed identity **does use MSAL Node**: Azure Identity's
  `credentials/managedIdentityCredential/index.js` invokes
  `ManagedIdentityApplication.acquireToken`. In installed
  `@azure/msal-node/lib/msal-node.cjs`, that path uses
  `acquireTokenFromManagedIdentity` and `sendManagedIdentityTokenRequest`, reaching
  the selected managed identity endpoint. It does not route through
  `acquireTokenByCode` in the inspected path.
- `credentials/azureCliCredential.js` obtains tokens by executing
  `az account get-access-token`; this wrapper does not call the installed Node
  MSAL authorization-code API.
- The installed Azure Identity authorization-code path exists separately:
  `AuthorizationCodeCredential` calls `getTokenByAuthorizationCode` in
  `msal/nodeFlows/msalClient.js`, which calls `acquireTokenByCode`. Application
  source does not instantiate that credential or call those methods. There is
  no default credential chain falling back to that credential in our SQL module.

**Assessment and limits:** static source review found no route from our configured
SQL credential flows to the affected authorization-code API. This is narrower
than claiming the dependency is fixed or the entire application is proven
non-exploitable. Live App Service authentication was not exercised during this
review; the runtime identity environment is assumed to match its documented
configuration. Azure CLI's own installation, login flow, and dependencies were
not audited. Reassess if credentials, SDK versions, or authorization-code features
change. Follow up when a supported Azure Identity release permits patched MSAL,
then rerun dependency/audit inspection, SQL tests, builds, packaging, and isolated
artifact verification. Do not suppress the existing audit finding as resolved.

### MSAL reassessment for admin authentication (2026-11-05)

This supersedes the earlier "no compatible parent update" result above. The
registry now supplies Azure Identity 4.14.1, whose declared MSAL Node range is
`^7.1.0`. The lockfile now resolves MSAL Node 7.2.0 through both SQL SDK paths,
without a major-version override or prerelease parent. The earlier affected
6.0.1 installation has been removed; the advisory's patched boundary is 7.1.0.
SQL continues using the same direct managed-identity/Azure CLI credential paths.

Entra user sign-in is superseded by Administrator-created password accounts using
Better Auth, email-code setup/recovery, additive roles and immediately revocable sessions. Azure
managed identity for SQL and GitHub OIDC deployment are retained. See
[admin authentication architecture/setup](apps/called-together/database/admin-auth.md)
for library/security evidence, operator bootstrap, immutable migrations,
development-only email preview, runtime permissions and verification results.
On November 11, 2026 the owner reported migrations 0001?0007 and targeted/full
application HTTP/SQL/Mailpit verification passed in `ct_password_auth_test`;
fixtures and append-only audit remain for review. Production authentication and
least-privilege runtime access remain unverified. No deployment-time migrations.
Resend is available as an explicitly selected server-only provider alongside local
Mailpit. The owner reported targeted hosted development verification on November
12: development authentication is enabled with delivery restricted to one approved
recipient. See [email configuration and verification scope](apps/called-together/docs/email-delivery.md).
Custom-domain and broader-recipient rollout remain pending; both authentication
gates default closed without explicit configuration.
Public pages/API/health remain anonymous; builds and isolated artifacts require
no authentication credentials.

## Current Azure resources for apps/web

The current web application deploys to Azure Static Web Apps Free. These existing
Azure resource names, site URL, and deployment-secret reference remain unchanged
by the Starweave repository rename. They identify the current web deployment,
not the monorepo or future applications. The current static-export deployment
architecture is preserved; an App Service migration is outside this change.

| Azure resource       | Value                                                   |
| -------------------- | ------------------------------------------------------- |
| Static Web App       | `my-web-project`                                        |
| Resource group       | `rg-my-web-project`                                     |
| Hosting plan         | Free                                                    |
| deploymentAuthPolicy | `DeploymentToken`                                       |
| Site                 | https://victorious-bush-002c17210.3.azurestaticapps.net |

The website uses Next.js `output: "export"` and retains
`transpilePackages: ["@repo/ui"]` for the shared Material UI components.
Build the deployable static site from the repository root:

```sh
npm run build:azure
```

This runs the web build and required workspace dependencies through Turborepo,
without building Storybook. The entry point is `apps/web/out/index.html`.
Turborepo caches the workspace-relative `out/**` output; Git and Prettier
ignore generated `out` directories. The existing `npm run build` command also
produces the static export, so CI's website build validates this output mode.

The deployment workflow builds on the GitHub runner using Node.js 24 and
npm 11.19.1, runs `npm ci` and `npm run build:azure`, and verifies the exported
entry point. Azure uploads these prebuilt files without an Oryx app build:

| Setting                  | Value                   |
| ------------------------ | ----------------------- |
| Plan                     | Free                    |
| Build preset             | Custom                  |
| App location             | `apps/web/out`          |
| API location             | Empty                   |
| Output location          | Empty                   |
| Skip app build           | `true`                  |
| Static export deployment | `IS_STATIC_EXPORT=true` |

The upload step retains `IS_STATIC_EXPORT: "true"`. Its app build command is
omitted because the runner has already built the site. OIDC helper steps are
no longer needed; production upload uses the existing deployment-token
secret. If Azure disables deployment-token authentication, select the deployment
token policy under the Static Web App's **Settings > Configuration > Deployment
configuration**. If the GitHub secret is missing, add the deployment token under
the repository's **Settings > Secrets and variables > Actions**, named
`AZURE_STATIC_WEB_APPS_API_TOKEN_VICTORIOUS_BUSH_002C17210`. Do not put the token
in source code or chat.

To update the deployment token:

1. In the Azure portal, open `my-web-project` in `rg-my-web-project` and choose
   **Manage deployment token**. Copy the current token, or reset it if rotating
   credentials. Resetting invalidates the previous token.
2. In GitHub, open **Settings > Secrets and variables > Actions** and update
   `AZURE_STATIC_WEB_APPS_API_TOKEN_VICTORIOUS_BUSH_002C17210` with the token.
   Keep its value out of logs, documentation, source files, and chat.
3. Open **Actions > Validate and Deploy**, select the failed run on `main`,
   and choose **Re-run failed jobs**. Alternatively, use **Run workflow** on
   `main` to validate and deploy again. Token rotation does not require a commit.

See Microsoft's [deployment token management guide](https://learn.microsoft.com/en-us/azure/static-web-apps/deployment-token-management)
for the portal steps.

There is currently no `staticwebapp.config.json`. If needed, place it in
`apps/web/public/staticwebapp.config.json` so Next.js includes it at the root of
`apps/web/out`. No Azure resources or credentials are created by these changes.
See Microsoft's
[static Next.js deployment guide](https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-nextjs-static-export).

The current app has no static-export blockers: no request-time APIs, Server
Actions, dynamic routes, middleware, or server-dependent redirects. The shared
theme and components render at build time. There is no `next/image` usage, so
no image configuration is needed. If added later, use a custom image loader
or unoptimized images rather than the default server optimizer. Features
requiring a running Next.js server need a different hosting strategy; see
[Next.js static export limitations](https://nextjs.org/docs/app/guides/static-exports#unsupported-features).
For a production preview, serve `apps/web/out` with a static file server;
`npm run start --workspace=web` uses `next start` and does not serve exports.

## Formatting

Prettier is installed at the repository root with an exact version. All
workspaces use `.prettierrc.json`: Prettier defaults with LF line endings.
Generated dependencies, build output, caches, coverage, and `next-env.d.ts`
are excluded through `.prettierignore`.

```sh
npm run format
npm run format:check
```

`format` rewrites files; `format:check` reports differences without changing
files. Source, stories, tests, and GitHub workflows are all checked.
Prettier runs separately from ESLint; the shared ESLint configurations apply
`eslint-config-prettier` last to disable conflicting formatting rules while
preserving code-quality checks.

In VS Code, install the recommended **Prettier - Code formatter** extension
(`esbenp.prettier-vscode`) from the Extensions view's workspace recommendations.
Shared `.vscode` settings enable format on save, require a Prettier config,
and select Prettier for the project's supported languages.

## Continuous integration

The workflow in `.github/workflows/validate-deploy.yml` runs on pushes to
`main`, pull requests targeting `main`, and manual runs. Its flow is
**Validate -> Select deployments -> Deploy Test / Deploy Called Together**.

Work on a feature branch, push it, and open a pull request targeting `main`.
Wait for Validate and review to pass, then merge. The resulting push to `main`
runs Validate again; only after success do selected deployment jobs publish
their corresponding build artifacts. Open each site URL to confirm visibility.

Validate uses Node.js 24 and npm 11.19.1, bootstrapped from `runner.temp`
before repository npm commands. It caches npm downloads using the root lockfile,
runs `npm ci`, formatting checks, lint, TypeScript checks, unit tests,
`npm run build:azure`, `npm run package:called-together`,
`npm run verify:called-together`, and the Storybook build.
Lint and TypeScript checks include both websites through their workspace scripts.
Each website builds independently, so the overlapping `npm run build` does not
run again. Validation verifies the test website's exported `index.html` and
smoke-tests Called Together's isolated standalone package on Linux.

Validate verifies `apps/web/out/index.html` and uploads the entire export as
`web-static`, including hidden files and `staticwebapp.config.json` if used.
Deploy Test requires successful validation, downloads the artifact, and uploads it
to Azure without installing dependencies, rebuilding, or invoking Oryx.
Only pushes to main and manual runs on main deploy. Pull requests validate
without accessing the deployment secret or creating previews.

Validation and deployment jobs have 20-minute timeouts; selection has 5 minutes.
All jobs have read-only repository contents permissions.
New runs cancel outdated runs for the same branch or pull request. Validation
needs no deployment or Turborepo remote cache credentials; Deploy Test uses the
existing Azure deployment-token secret. Called Together uses the OIDC variables
and job-scoped token permission described above. Only Select deployments has
`actions: read`, for baseline discovery; validation has no Actions history access.

The superseded CI and Azure workflows and preview cleanup job are removed.
Any preview environments created by the old workflow may need one-time cleanup
in the Azure portal under the Static Web App's Environments page. This change
does not delete those environments automatically.

View results under **Actions > Validate and Deploy**, or the pull request's
**Checks** tab. Manual runs are available through **Run workflow**. The job
names include **Validate**, **Select deployments**, **Deploy Test**, and
**Deploy Called Together**. Review branch-protection required checks
if they reference old workflow/job names; require Validate rather than Deploy Test,
which is intentionally skipped on pull requests.

### Automatic deployment selection and recovery

Validation always runs the existing checks, both application builds, Storybook,
Called Together packaging and isolated smoke tests, and both artifact uploads.
Selection optimizes deployment only. Pull requests and manual runs off `main`
never deploy; their selection job is skipped.

On a push to `main`, `scripts/select-deployments.mjs` uses GitHub Actions history
for this workflow to find each application's last **successful deployment job**:
`Deploy Test` (job ID `deploy`) for workspace `web`, and `Deploy Called Together`
for workspace `called-together`. Historical test deployments named `Deploy` are
also recognized, so renaming the display name preserves existing baselines.
Overall run success is not used: a successful website deployment
counts even if the other deployment fails. Skipped, cancelled, and failed deployment
jobs do not advance a baseline. Keep the deployment job names stable.

History enumeration paginates workflow runs and attempt-specific job lists, examines
all rerun attempts, and excludes the currently running attempt. Earlier attempts of
the same run remain eligible. The most recently completed successful deployment
job wins, including an old commit deployed by a later rerun. The API scan has a
90-second / 500-request budget; failed, incomplete, inaccessible, or exhausted
history falls back to deployment rather than assuming nothing changed.
The unfiltered run list avoids GitHub's filtered-search 1,000-result ceiling.
See GitHub's [run history](https://docs.github.com/en/rest/actions/workflow-runs)
and [attempt-specific job history](https://docs.github.com/en/rest/actions/workflow-jobs)
API documentation.

Selection checks out full Git history (`fetch-depth: 0`), verifies each baseline
is an ancestor of the current SHA, and compares the full `baseline..current`
range, including deleted and renamed paths. A missing/unreachable baseline or
unknown ancestry conservatively deploys that application. This preserves pending
changes after failed deployments: a subsequent documentation-only push still
retries the website whose application changes have not been successfully deployed.

The installed Turbo 2.11.10 supplies its actual package graph through a supported
`turbo query`, including development and transitive workspace dependencies. The
graph exported by Validate is used without installing dependencies in selection.
Git provides the per-application SHA ranges; explicit path classification prevents
Turbo's default documentation hashing from triggering unnecessary deployments.

| Change since each app's successful deployment                                    | Automatic result       |
| -------------------------------------------------------------------------------- | ---------------------- |
| `apps/web` source/config/assets                                                  | Test website           |
| `apps/called-together` source/config/assets                                      | Called Together        |
| Workspace dependency, including transitive dependency                            | Each consuming website |
| Root lockfile, root configuration, workflow, selection logic, or uncertain input | Both conservatively    |
| Called Together packaging/smoke scripts                                          | Called Together        |
| Conventional documentation only, with no pending application changes             | Neither                |
| `apps/storybook` only, with no website dependency on it                          | Neither                |

Documentation exclusions cover conventional README/changelog/contribution/license/
agent documents at root or workspace roots, their `docs/` directories, root text
documents, and GitHub Markdown documentation. Markdown/MDX under app/source trees
and public assets remains an input. If application code or a build starts consuming
a file in an excluded documentation location, add its repository-relative path
or directory to `documentationBuildInputs` in `scripts/deployment-policy.json`.
Those explicit inputs override the documentation exclusion. The current websites
do not consume these conventional documentation files. Unknown paths and graph
failures deploy conservatively. No build task inputs or cache behavior are changed.

Each selection job writes baseline SHAs, explicit deployment booleans, and reasons
to its GitHub Actions job summary. A missing baseline on the first run deploys
that website even if the current changes are documentation only. Successfully
deployed SHAs are tracked entirely through job history; no checkpoint commits or
repository write permissions are required.

For recovery, open **Actions > Validate and Deploy > Run workflow**, select branch
`main`, and choose `deploy_target`:

- `auto` (default): compare against each successful deployment baseline.
- `test`: force only the test website after full validation.
- `called-together`: force only Called Together after full validation.
- `both`: force both after full validation.

Manual forced choices override missing history and change selection, but do not
bypass validation or the main-branch restriction. Use them after an out-of-band
Azure change, when deliberately redeploying unchanged code, or when recovering
from expired artifacts (run the whole workflow to regenerate them). **Re-run failed
jobs** can retry a failed deployment while its original artifacts remain available;
rerun attempts are included in future baseline discovery. Azure OIDC authentication,
artifact handoff across GitHub jobs, historical API access, and live readiness still
require a GitHub Actions run on `main` to verify.

Run the focused selection tests locally with:

```sh
node --test scripts/deployment-decisions.test.mjs
```

## Testing

Run unit and React component tests from the repository root:

```sh
npm test
npm run test:watch
npm run test:coverage
```

Tests live beside their components as `*.test.tsx` (or `*.test.ts` for
non-React units), starting with `packages/ui/src/content-card/content-card.test.tsx`.
The UI workspace uses Vitest with jsdom and automatic React JSX support from
its TypeScript configuration. Its setup loads jest-dom matchers and cleans up
React renders after every test.

Use `renderWithProviders` from `packages/ui/src/test/render-with-providers.tsx`
to render with the same Material UI theme/provider as the website and Storybook.
Prefer accessible queries; for interactive components, create
`const user = userEvent.setup()` using `@testing-library/user-event` and await
user actions. ContentCard has required title and description props, an optional
eyebrow, and no links or callbacks. Its tests cover rendering and prop updates.

Coverage prints a text summary and writes an HTML report. Open
`packages/ui/coverage/index.html` in your browser after `npm run test:coverage`.
Eligible untested source files are included; stories, tests, test helpers,
declaration files, export-only index files, configuration, and generated output
are excluded. Coverage reports are ignored by Git and cached by Turborepo.

Unit tests use their own `packages/ui/vitest.config.mts` and only discover
`src/**/*.test.{ts,tsx}`. They do not run Storybook stories or browser tests;
keep future Storybook browser tests in a separate configuration and task.
Turborepo caches one-shot test tasks and coverage, including changes in
dependent workspaces through the `test:inputs` transit task. Watch mode is
persistent and uncached. Add testing dependencies and scripts to each workspace
that starts using them.

On Windows PowerShell with script execution disabled, use `npm.cmd` in place
of `npm`.

## Where to add code

Shared header/footer usage, link adapters, and accessibility behavior are documented
in [packages/ui/README.md](packages/ui/README.md). Called Together supplies its
own navigation and copyright in `apps/called-together/app/site-layout.tsx`.

- Add experimentation/test pages, layouts, and app-specific UI in `apps/web/app`.
- Add ministry pages, content, components, and theme in `apps/called-together/app`.
- Add reusable React components, the shared Material UI theme, and its provider
  in `packages/ui/src`.
- Add component stories beside their components in `packages/ui/src` using the
  `*.stories.tsx` naming pattern. For example, copy the structure of
  `packages/ui/src/content-card/content-card.stories.tsx`, define story args for the
  component's props, and add the `autodocs` tag to enable generated docs and
  interactive controls.
- Storybook's Vite configuration and preview decorators live in
  `apps/storybook/.storybook`.
- Shared ESLint and TypeScript configurations live in
  `packages/eslint-config` and `packages/typescript-config`.
