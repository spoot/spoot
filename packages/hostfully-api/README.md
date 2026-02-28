# @spoot/hostfully-api

TypeScript client for the [Hostfully](https://www.hostfully.com) property management GraphQL API. Covers properties, fees, pricing, leads, messages, agencies, orders, and amenities.

## Install

```sh
npm install @spoot/hostfully-api
```

## Usage

```ts
import { HostfullyApi } from "@spoot/hostfully-api";
import "dotenv/config";

const api = new HostfullyApi({
  endpoint: new URL("https://api.hostfully.com/graphql"),
  apiKey: process.env.HOSTFULLY_API_KEY!,
});

const properties = await api.properties.list();
const pricing = await api.pricing.get(propertyUid, checkIn, checkOut);
```

Internally uses `@spoot/gql` for query execution, `@spoot/rx` for streaming results, and `@spoot/schedule` / `@spoot/day` for date handling.

## Development

```sh
pnpm typecheck   # type-check
pnpm build:lib   # compile to dist/
```
