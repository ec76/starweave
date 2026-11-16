# Starweave

A TypeScript monorepo for independent Next.js applications with shared
React components, Storybook, automated tests, and Azure deployment workflows.

The main application is Called Together, a ministry website under active
development. A separate web application provides a place to develop and
explore shared interface patterns.

## Project structure

| Path                         | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| `apps/called-together`       | Called Together website and server functionality |
| `apps/web`                   | UI experimentation and test website              |
| `apps/storybook`             | Component catalog and interface examples         |
| `packages/ui`                | Shared React components and theme utilities      |
| `packages/eslint-config`     | Shared lint configuration                        |
| `packages/typescript-config` | Shared TypeScript configuration                  |

## Engineering approach

- Share presentational components while keeping application content,
  routing, and business logic within each application.
- Use application themes to support distinct visual identities.
- Document components and interface states in Storybook.
- Test shared components with Vitest and React Testing Library.
- Validate formatting, lint, types, tests, builds, and packaged application
  smoke checks through GitHub Actions.
- Deploy the static web application and Called Together independently.

## Development workflow

Starweave is developed with AI assistance for planning, implementation,
debugging, tests, and documentation. I define requirements, evaluate proposed
changes, and review the resulting behavior. The repository includes documented
development conventions and automated checks for formatting, lint, types,
tests, and builds.

## Run locally

Use Node.js 24 and npm 11.19.1.

```sh
git clone https://github.com/ec76/starweave.git
cd starweave
npm ci
npm run dev
```

- Test website: http://localhost:3000
- Called Together: http://localhost:3001

Called Together's database-backed features require additional configuration.
See the development guide before using those features.

To start Storybook separately:

```sh
npm run storybook
```

Storybook: http://localhost:6006

## Useful checks

```sh
npm run format:check
npm run lint
npm run check-types
npm test
npm run build-storybook
```

## Documentation

- [Development and deployment guide](docs/development-guide.md)
- [Shared UI components](packages/ui/README.md)
- [Called Together design standards](docs/called-together-design-system.md)
- [Database guide](apps/called-together/database/README.md)
- [Current backlog](docs/backlog.md)

## Status

Active development. Features and administrative workflows continue to evolve.
