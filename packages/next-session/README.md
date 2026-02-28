# @spoot/next-session

Encrypted, stateless cookie sessions for Next.js route handlers using [iron-session](https://github.com/vvo/iron-session) with [Zod](https://zod.dev) validation.

## Install

```sh
npm install @spoot/next-session
```

Requires `next` as a peer dependency.

## Usage

```ts
import { Session, type SessionConfig } from "@spoot/next-session";
import { type NextRequest } from "next/server";

const config: SessionConfig = {
  cookieName: "my-app-session",
  password: process.env.SESSION_SECRET!,
};

export async function GET(req: NextRequest) {
  const session = await Session.get(req, config);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ user: session.email });
}
```

Sessions are signed and encrypted with `iron-session`. The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

## Development

```sh
pnpm typecheck   # type-check
pnpm build:lib   # compile to dist/
```
