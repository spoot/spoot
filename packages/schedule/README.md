# @spoot/schedule

Recurring schedule definitions with [`@spoot/day`](../day) date matching. Define daily, weekly, or monthly schedules and check whether a given `Day` falls within them.

## Install

```sh
npm install @spoot/schedule @spoot/day
```

## Usage

```ts
import { Schedule } from "@spoot/schedule";
import { Day } from "@spoot/day";

const everyMonday = Schedule.weekly({ dayOfWeek: 1 });
const firstOfMonth = Schedule.monthly({ dayOfMonth: 1 });

const today = Day.today();

console.log(everyMonday.includes(today));   // true or false
console.log(firstOfMonth.includes(today));  // true or false
```

## Development

```sh
pnpm typecheck   # type-check
pnpm test        # run Jest tests
pnpm build:lib   # compile to dist/
```
