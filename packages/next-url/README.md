# @spoot/next-url

Next.js URL utilities for route handlers and middleware: read the canonical request URL and validate redirect targets to prevent open-redirect vulnerabilities.

## Install

```sh
npm install @spoot/next-url
```

Requires `next` as a peer dependency.

## Usage

```ts
import { getCurrentUrl, getRedirectTarget } from "@spoot/next-url";
import { type NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const url = getCurrentUrl(req); // resolves host from headers

  const target = getRedirectTarget(url); // validates ?next= param
  if (target instanceof NextResponse) return target; // 400 on bad redirect

  return NextResponse.redirect(target);
}
```

## API

- **`getCurrentUrl(req)`** – Returns a `URL` with the correct `host` from request headers (handles reverse-proxy scenarios).
- **`getRedirectTarget(url, paramName?)`** – Reads a redirect URL from a query param and validates it is same-origin. Returns a `NextResponse` (400) on invalid input.

## Development

```sh
pnpm typecheck   # type-check
pnpm build:lib   # compile to dist/
```
