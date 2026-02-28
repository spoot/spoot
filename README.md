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

- [Node.js](https://nodejs.org) ≥ 24
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

Packages are published automatically via GitHub Actions when changes land on `main`. The release script (`scripts/publish.ts`) diffs each package against its last git tag, sends the diff to Gemini via Cloudflare AI Gateway to determine the right semver bump, then updates changelogs, commits the version bump, and publishes to npm.

Just push to `main` — no manual version bumping or changeset files needed.

### How a release works

1. For each package, the script finds the last git tag (e.g. `@spoot/day@1.0.0`)
2. Diffs that tag against `HEAD` for that package directory
3. Asks Gemini to classify the change as `major`, `minor`, `patch`, or `none`
4. Cascades patch bumps to any package whose runtime dependency is releasing
5. Updates `CHANGELOG.md` and `package.json` for each affected package
6. Commits with `[skip ci]`, creates git tags, pushes, then publishes to npm

### Running locally

Copy `.env.local.example` to `.env.local` and fill in your credentials (the file is gitignored):

```sh
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `CF_AI_GATEWAY_URL` | Cloudflare AI Gateway base URL — find it in the Cloudflare dashboard under **AI › AI Gateway** |
| `CF_AI_GATEWAY_TOKEN` | Bearer token for your gateway |

For npm auth, run `npm login` once before your first local publish. The credentials are stored by npm and reused on subsequent runs.

```sh
DRY_RUN=1 pnpm release   # full Gemini analysis, prints plan, no publish
pnpm release              # full release
```

### GitHub Actions secrets

Add these secrets to the repository (**Settings › Secrets and variables › Actions**):

| Secret | Value |
|---|---|
| `CF_AI_GATEWAY_URL` | Same as above |
| `CF_AI_GATEWAY_TOKEN` | Same as above |

CI publishes via **npm OIDC** — no stored npm token required. The workflow requests a short-lived OIDC token via the `id-token: write` permission and passes `--provenance` to `pnpm publish`. To enable this, configure npm to trust the GitHub Actions OIDC provider for the `@spoot` scope:

```sh
npm access grant read-write npm:@spoot --otp <code>
npm trust github.com/spoot/spoot
```

Or configure it in the npm web UI under **Account › Packages › @spoot › Settings › Provenance**.

The release workflow also needs **Settings › Actions › General › Workflow permissions** set to **Read and write permissions** so it can push the version-bump commit back to `main`.

## License

MIT
