# @spoot/day

Type-safe date abstractions: `Day`, `Week`, `Month`, `CalendarWeek`, and `DaySelector`. All values are plain-object serializable and free of timezone surprises.

## Install

```sh
npm install @spoot/day
```

## Usage

```ts
import { Day, Week, Month, DaySelector } from "@spoot/day";

const today = Day.today();
const week = Week.containing(today);
const month = Month.containing(today);
```

- **`Day`** – calendar date (YYYY-MM-DD), no time component
- **`Week`** – ISO week with start/end days
- **`Month`** – calendar month with helpers for iterating days
- **`CalendarWeek`** – a week as displayed in a calendar grid (may span two months)
- **`DaySelector`** – predicate for matching days (e.g. every Monday, last day of month)

## Development

```sh
pnpm typecheck   # type-check
pnpm test        # run Jest tests
pnpm build:lib   # compile to dist/
```
