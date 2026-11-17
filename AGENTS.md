<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Starweave repository conventions

Starweave ([ec76/starweave](https://github.com/ec76/starweave)) is a generic
monorepo for independent applications with their own pages and deployments.
Preserve workspace package names such as `@repo/ui` and the current `apps/web`
and `apps/storybook` paths unless a task explicitly changes them.
The current Azure resources for `apps/web` retain their original names and URL
as documented in README.md. Preserve their deployment-secret reference and
static-export deployment configuration; an App Service migration is separate work.

- Run commands from the repository root using Node.js 24 and npm 11.19.1.
  Install fresh clones with `npm ci`; preserve version requirements and the lockfile.
- Website pages live in `apps/web/app`. Shared Material UI components live in
  their own directories under `packages/ui/src`, with colocated `*.stories.tsx`
  and `*.test.tsx` files. Use the existing theme and `renderWithProviders` helper.
- Use Prettier's root configuration and keep generated output untracked.
  Do not add tests solely for static text or test Material UI implementation details.
- Validate changes with `npm run format`, `npm run format:check`, `npm run lint`,
  `npm run check-types`, `npm test`, `npm run build:azure`, and
  `npm run build-storybook`. Verify `apps/web/out/index.html` exists.
  On PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.
- Next.js uses static export and transpiles `@repo/ui`; preserve both settings.
  Report features requiring a server before changing application behavior.
- Use a feature branch and PR to `main`. The combined Validate and Deploy
  workflow validates PRs and deploys successful main builds using `web-static`.
  The runner builds; Azure uploads without Oryx. Keep token values out of logs
  and source. Do not commit, push, or change Azure resources unless requested.

- Called Together visual work follows [the design standards](docs/called-together-design-system.md); keep brand tokens and content in apps/called-together.

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues for `ec76/starweave`.
Read `docs/agents/issue-tracker.md` before tracker operations.

### Triage labels

Use the five default triage labels.
Read `docs/agents/triage-labels.md` before triaging issues.

### Domain docs

Use multi-context domain documentation.
Read `docs/agents/domain.md` before exploring domain concepts or decisions.
