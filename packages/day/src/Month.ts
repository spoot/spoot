import { CalendarWeek } from "./CalendarWeek";
import { Day } from "./Day";

const MONTH_STRINGS = "jan feb mar apr may jun jul aug sep oct nov dec".split(
  " ",
);

export function parseMonth(input: string | number): number {
  if (typeof input === "number") {
    return input;
  }

  const i = MONTH_STRINGS.indexOf(input.toLocaleLowerCase());
  if (i === -1) {
    throw new Error(
      `Invalid month name, expected a 3-character month name, got ${input}`,
    );
  }
  return i;
}

export function monthToString(month: number): string {
  const str = MONTH_STRINGS.at(month);
  if (!str) {
    throw new Error(`invalid month value ${month}`);
  }
  return str.slice(0, 1).toUpperCase() + str.slice(1);
}

const JSON_FORMAT = /^(\d{4})-(\d{2})$/;

export class Month {
  static from(input: string | Month): Month {
    if (typeof input !== "string") return input;

    const match = input.match(JSON_FORMAT);
    if (!match) {
      throw new Error(`Invalid month format, expected YYYY-MM, got ${input}`);
    }

    return new Month(new Day(Number(match[1]), Number(match[2]) - 1, 1));
  }

  constructor(private readonly start: Day) {
    if (this.start.startOfMonth.neq(this.start)) {
      throw new Error("start must be the first day of the month");
    }
  }

  toString() {
    return `${monthToString(this.start.month)} ${this.start.year}`;
  }

  add(months: number) {
    return new Month(this.start.add(0, months, 0));
  }

  get next() {
    return this.add(1);
  }

  get previous() {
    return this.add(-1);
  }

  get firstDay() {
    return this.start;
  }

  get lastDay() {
    return this.start.endOfMonth;
  }

  get calendarWeeks() {
    return CalendarWeek.allSpanning(this.start, this.lastDay);
  }

  get year() {
    return this.start.year;
  }

  /**
   * The month number, 0-indexed.
   */
  get number() {
    return this.start.month;
  }

  contains(day: Day) {
    return this.start.lte(day) && this.lastDay.gte(day);
  }

  toJSON() {
    return `${this.start.year}-${(this.start.month + 1).toString().padStart(2, "0")}`;
  }

  eq(other: Month) {
    return this.start.eq(other.start);
  }

  gt(other: Month) {
    return this.start.gt(other.start);
  }

  gte(other: Month) {
    return this.start.gte(other.start);
  }

  lt(other: Month) {
    return this.start.lt(other.start);
  }

  lte(other: Month) {
    return this.start.lte(other.start);
  }
}
