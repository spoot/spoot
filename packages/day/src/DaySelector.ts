import { Day } from "./Day";
import { monthToString, parseMonth } from "./Month";

const PATTERN =
  /^(\w{3})(?:\s*(\d{1,2}))?(?:\s*(\d{4}))?\s*(?:-\s*(\w{3})?(?:\s*(\d{1,2}))?(?:\s*(\d{4}))?)?$/i;

export class Bound {
  constructor(
    public readonly month: number,
    public readonly day?: number,
    public readonly year?: number,
  ) {}

  toString() {
    return [monthToString(this.month), this.day, this.year]
      .filter((x) => typeof x === "string" || Number.isFinite(x))
      .join("-");
  }
}

export class DaySelector {
  static parse(at: string, input: string) {
    const match = input.match(PATTERN);
    if (!match) {
      throw new Error(
        `Invalid date selector at ${at}, expected one or two dates separated by a hyphen`,
      );
    }

    const [, startMon, startDay, startYear, endMon, endDay, endYear] = match;
    return {
      startMon,
      startDay,
      startYear,
      endMon,
      endDay,
      endYear,
    };
  }

  static fromString(at: string, input: string): DaySelector {
    const { startMon, startDay, startYear, endMon, endDay, endYear } =
      DaySelector.parse(at, input);

    return new DaySelector(
      [
        startMon,
        startDay ? Number(startDay) : undefined,
        startYear ? Number(startYear) : undefined,
      ],
      endMon || endDay || endYear
        ? [
            endMon ? endMon : startMon,
            endDay ? Number(endDay) : undefined,
            endYear ? Number(endYear) : undefined,
          ]
        : undefined,
    );
  }

  static get everyDay(): DaySelector {
    return new DaySelector(["jan", 1, 0], ["dec", 31, 9999]);
  }

  public readonly lower: Bound;
  public readonly upper: Bound;

  constructor(
    lower: [string | number, number?, number?],
    upper?: [string | number, number?, number?],
  ) {
    this.lower = new Bound(parseMonth(lower[0]), lower[1], lower[2]);
    this.upper = upper
      ? new Bound(parseMonth(upper[0]), upper[1], upper[2])
      : new Bound(this.lower.month, this.lower.day, this.lower.year);
  }

  toString() {
    return `${this.lower} - ${this.upper}`;
  }

  assertMatch(day: Day): void {
    if (!this.match(day)) {
      throw new Error(`Day ${day} doesn't match selector "${this}"`);
    }
  }

  assertNoMatch(day: Day): void {
    if (this.match(day)) {
      throw new Error(
        `Day ${day} matches selector "${this}" when it should not`,
      );
    }
  }

  match(day: Day): boolean {
    if ((this.lower.day != null) !== (this.upper.day != null)) {
      throw new Error(
        `If one side of a bound specifies a day, the other side must also specify a day`,
      );
    }

    if ((this.lower.year != null) !== (this.upper.year != null)) {
      throw new Error(
        `If one side of a bound specifies a year, the other side must also specify a year`,
      );
    }

    // validate years are compatible
    if (
      !within(
        day.year,
        this.lower.year ?? -Infinity,
        this.upper.year ?? this.lower.year ?? Infinity,
      )
    )
      return false;

    // Check month/day boundaries precisely. When no day is specified,
    // use 1 for the lower bound and the actual last day of the month
    // for the upper bound.
    const lm = this.lower.month;
    const ld = this.lower.day ?? 1;
    const um = this.upper.month;
    const ud =
      this.upper.day ?? new Day(day.year, this.upper.month, 1).endOfMonth.day;
    const dm = day.month;
    const dd = day.day;

    const wrapped =
      lm > um || (lm === um && ld > ud);

    if (wrapped) {
      // Range wraps around year end (e.g. oct-feb)
      if (dm > lm || dm < um) return true;
      if (dm === lm) return dd >= ld;
      if (dm === um) return dd <= ud;
      return false;
    } else {
      // Range within a single year (e.g. jan-mar)
      if (dm > lm && dm < um) return true;
      if (dm === lm && dm === um) return dd >= ld && dd <= ud;
      if (dm === lm) return dd >= ld;
      if (dm === um) return dd <= ud;
      return false;
    }
  }
}

function within(n: number, lower: number, upper: number): boolean {
  return n >= lower && n <= upper;
}

