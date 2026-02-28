# @spoot/gql

GraphQL query execution helper with [Zod](https://zod.dev) schema validation. Wraps the native `fetch` API to send GraphQL requests and parse/validate the response.

## Install

```sh
npm install @spoot/gql
```

## Usage

```ts
import { gql, fetchGql } from "@spoot/gql";
import { z } from "zod";

const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
    }
  }
`;

const UserSchema = z.object({
  user: z.object({ id: z.string(), name: z.string() }),
});

const data = await fetchGql(
  new URL("https://api.example.com/graphql"),
  { Authorization: "Bearer token" },
  GET_USER,
  UserSchema,
);
```

Throws a descriptive error on HTTP failure or GraphQL `errors` in the response.

## Development

```sh
pnpm typecheck   # type-check
pnpm build:lib   # compile to dist/
```
