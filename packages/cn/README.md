# @spoot/cn

Utility for merging Tailwind CSS class names using [`clsx`](https://github.com/lukeed/clsx) and [`tailwind-merge`](https://github.com/dcastil/tailwind-merge).

## Install

```sh
npm install @spoot/cn
```

## Usage

```ts
import { cn } from "@spoot/cn";

<div className={cn("px-4 py-2", isActive && "bg-blue-500", className)} />
```

The `cn` function accepts any combination of strings, arrays, and objects (everything `clsx` supports), then passes the result through `tailwind-merge` to resolve conflicting Tailwind classes.

## Development

```sh
pnpm typecheck   # type-check
pnpm build:lib   # compile to dist/
```
