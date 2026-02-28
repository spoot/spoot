# @spoot/log

Simple structured logger for Node.js. Formats output as single lines (newlines escaped) so log aggregation tools can parse entries reliably.

## Install

```sh
npm install @spoot/log
```

## Usage

```ts
import { logger } from "@spoot/log";

logger.info("Server started on port %d", 3000);
logger.error("Request failed", err);
```

Each call to `logger.info` or `logger.error` emits exactly one line. Multi-line values have their newlines replaced with `\n` so they don't break log parsers.

## Development

```sh
pnpm typecheck   # type-check
pnpm build:lib   # compile to dist/
```
