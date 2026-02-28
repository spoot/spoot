# @spoot/cli

Type-safe CLI argument parsing and command framework for Node.js scripts. Provides `Cli`, `Command`, and `Args` abstractions for building structured command-line tools with minimal boilerplate.

## Install

```sh
npm install @spoot/cli
```

## Usage

```ts
import { Cli, Command, Args } from "@spoot/cli";

const deploy = new Command({
  name: "deploy",
  args: Args.object({
    env: Args.string().enum(["staging", "prod"]),
    dryRun: Args.boolean().optional(),
  }),
  run: async ({ env, dryRun }) => {
    console.log(`Deploying to ${env}`, { dryRun });
  },
});

const cli = new Cli({ commands: [deploy] });
await cli.run(process.argv.slice(2));
```

Also exports `loadEnv` for loading `.env` files and `fail` for printing an error and exiting.

## Development

```sh
pnpm typecheck   # type-check
pnpm test        # run Jest tests
pnpm build:lib   # compile to dist/
```
