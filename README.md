# @spoot packages

A monorepo of shared TypeScript packages published to npm under the `@spoot` scope.

## Packages

| Package | Description |
|---|---|
| [`@spoot/cli`](./packages/cli) | Type-safe CLI argument parsing and command framework |
| [`@spoot/cn`](./packages/cn) | Tailwind CSS class merging (clsx + tailwind-merge) |
| [`@spoot/day`](./packages/day) | Date abstractions: Day, Week, Month, CalendarWeek |
| [`@spoot/gql`](./packages/gql) | GraphQL fetch helper with Zod response validation |
| [`@spoot/hostfully-api`](./packages/hostfully-api) | Hostfully property management API client |
| [`@spoot/log`](./packages/log) | Structured single-line logger for Node.js |
| [`@spoot/next-session`](./packages/next-session) | Encrypted cookie sessions for Next.js |
| [`@spoot/next-url`](./packages/next-url) | Next.js URL utilities and redirect validation |
| [`@spoot/react-vision-icon`](./packages/react-vision-icon) | Animated Apple Vision Pro-style icon for React |
| [`@spoot/rx`](./packages/rx) | RxJS namespace re-exports and utilities |
| [`@spoot/schedule`](./packages/schedule) | Recurring schedule definitions with Day matching |

## Requirements

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) ≥ 10

## Setup

```sh
pnpm install
pnpm build       # compile all packages
```

## Development

Run typecheck, tests, and auto-rebuild across all packages as you edit files:

```sh
# Watch all packages (recompile on save)
pnpm dev

# Typecheck + test all packages once
pnpm check

# Run only tests
pnpm test

# Typecheck only
pnpm typecheck
```

Each package also supports the same commands individually:

```sh
cd packages/day
pnpm typecheck
pnpm test
pnpm build:lib
```

## Publishing

Packages are published automatically via GitHub Actions when changes land on `main`.

To describe your changes and trigger a release:

```sh
pnpm changeset       # describe what changed and the semver bump
git add .changeset
git commit -m "chore: add changeset"
git push
```

When the resulting **"Version Packages"** PR is merged, the CI pipeline will:

1. Bump versions in `package.json` based on changeset files
2. Update `CHANGELOG.md` for each changed package
3. Commit the version bump and create git tags
4. Publish the updated packages to npm

## License

MIT
