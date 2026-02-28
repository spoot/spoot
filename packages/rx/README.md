# @spoot/rx

RxJS utilities and namespace re-exports. Provides a convenience `Rx` namespace that re-exports the most commonly used RxJS operators and types, plus a few extra utilities.

## Install

```sh
npm install @spoot/rx
```

## Usage

```ts
import { Rx, Observable } from "@spoot/rx";

const values$ = new Observable<number>((sub) => {
  sub.next(1);
  sub.complete();
});

values$.pipe(
  Rx.filter((n) => n > 0),
  Rx.map((n) => n * 2),
  Rx.tap((n) => console.log(n)),
).subscribe();
```

Also exports `log$` – a tap operator that logs each value:

```ts
import { log$ } from "@spoot/rx";

values$.pipe(log$("value:")).subscribe();
```

## Development

```sh
pnpm typecheck   # type-check
pnpm build:lib   # compile to dist/
```
