# spoot monorepo memory

## Repository
- pnpm monorepo at /Users/spoot/Developer/spoot
- 11 packages in packages/ (no tsconfig/eslint-config — those stayed in cleanplate)
- Shared tsconfig.base.json and tsconfig.react.json at root

## Publishing
- Changesets: run `pnpm changeset` to describe a change, then push
- GitHub Actions release.yml creates a "Version Packages" PR on main pushes
- Merging that PR triggers npm publish
- Requires NPM_TOKEN secret in the GitHub repo

## Package names
- Next.js packages: @spoot/next-url, @spoot/next-session
- React packages: @spoot/react-vision-icon
