import { CalendarWeek } from "./CalendarWeek";
import { monthToString } from "./Month";

const CURRENT_YEAR = new global.Date().getFullYear();

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T\d\d:\d\d:\d\d)?$/;

export class Day {
  static from(input: string | Day | Date) {
    if (input instanceof Day) {
      return input;
    }

    if (input instanceof Date) {
      return new Day(input.getFullYear(), input.getMonth(), input.getDate());
    }

    const match = input.match(PATTERN);
    if (!match) {
      throw new Error(`Invalid date format: ${input}`);
    }

    return new Day(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  static get today() {
    const now = new Date();
    return new Day(now.getFullYear(), now.getMonth(), now.getDate());
  }

  static min(a: Day, b: Day) {
    return b.lt(a) ? b : a;
  }

  static max(a: Day, b: Day) {
    return b.gt(a) ? b : a;
  }

  private readonly date: Date;

  constructor(year?: number, month?: number, day?: number) {
    if (year === undefined || month === undefined || day === undefined) {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
      day = now.getDate();
    } else {
      year ??= 0;
      month ??= 0;
      day ??= 1;
    }

    this.date = new Date(year, month, day);
  }

  get jsDate() {
    return this.date;
  }

  get utcMidnight() {
    return new Date(Date.UTC(this.year, this.month, this.day));
  }

  get year() {
    return this.date.getFullYear();
  }

  /**
   * 0-indexed month of the day
   */
  get month() {
    return this.date.getMonth();
  }

  /**
   * Day of the month
   */
  get day() {
    return this.date.getDate();
  }

  get dayOfYear() {
    let dayOfMonth = this.day;

    for (
      let prev = this.add(0, -1, 0);
      prev.year === this.year;
      prev = prev.add(0, -1, 0)
    ) {
      dayOfMonth += prev.daysInMonth;
    }

    return dayOfMonth;
  }

  private _isFridayOrSaturday: boolean | undefined;
  get isFridayOrSaturday() {
    return (this._isFridayOrSaturday ??= this.date.getDay() >= 5);
  }

  /**
   * Zero-based day of the week as a number
   */
  private _dayOfWeek: number | undefined;
  get dayOfWeek() {
    return (this._dayOfWeek ??= this.date.getDay());
  }

  private _nextDay: Day | undefined;
  get nextDay() {
    return (this._nextDay ??= new Day(this.year, this.month, this.day + 1));
  }

  private _previousDay: Day | undefined;
  get previousDay() {
    return (this._previousDay ??= new Day(this.year, this.month, this.day - 1));
  }

  private _daysInMonth: number | undefined;
  get daysInMonth() {
    return (this._daysInMonth ??= new Day(this.year, this.month + 1, 0).day);
  }

  private _startOfMonth: Day | undefined;
  get startOfMonth() {
    return (this._startOfMonth ??= new Day(this.year, this.month, 1));
  }

  private _endOfMonth: Day | undefined;
  get endOfMonth() {
    return (this._endOfMonth ??= new Day(
      this.year,
      this.month,
      this.daysInMonth,
    ));
  }

  private _weekOfYear: number | undefined;
  get weekOfYear() {
    return (this._weekOfYear ??= Math.floor(this.day / 7));
  }

  private _startOfWeek: Day | undefined;
  get startOfWeek() {
    return (this._startOfWeek ??= new Day(
      this.year,
      this.month,
      this.day - this.dayOfWeek,
    ));
  }

  private _calendarWeek: CalendarWeek | undefined;
  get calendarWeek() {
    return (this._calendarWeek ??= new CalendarWeek(this.startOfWeek));
  }

  private _nextWeek: Day | undefined;
  get nextWeek() {
    return (this._nextWeek ??= this.add(0, 0, 7));
  }

  private _prevWeek: Day | undefined;
  get prevWeek() {
    return (this._prevWeek ??= this.add(0, 0, -7));
  }

  add(years: number, months: number, days: number) {
    return new Day(this.year + years, this.month + months, this.day + days);
  }

  eq(day: Day) {
    return this.valueOf() === day.valueOf();
  }

  lt(day: Day) {
    return this.valueOf() < day.valueOf();
  }

  lte(day: Day) {
    return this.valueOf() <= day.valueOf();
  }

  gt(day: Day) {
    return this.valueOf() > day.valueOf();
  }

  gte(day: Day) {
    return this.valueOf() >= day.valueOf();
  }

  neq(day: Day) {
    return !this.eq(day);
  }

  valueOf() {
    return this.date.valueOf();
  }

  print() {
    return `${monthToString(this.month)} ${this.day}${this.year === CURRENT_YEAR ? "" : `, ${this.year}`}`;
  }

  toJSON() {
    const month = String(this.month + 1).padStart(2, "0");
    const day = String(this.day).padStart(2, "0");
    return `${this.year}-${month}-${day}`;
  }

  isSameMonth(day: Day) {
    return this.year === day.year && this.month === day.month;
  }

  /**
   * Determines the difference between the two days, in days. If the argument
   * is in the future the result is positive
   */
  diff(day: Day): number {
    if (this.gt(day)) {
      // we always want to count forward, so if day is in the past count
      // the other way and flip the sign
      return -day.diff(this);
    }

    // simple math can get us close, but we can't account for leap years and such so
    // we'll just iterate until we get the right answer
    let guess = (day.year - this.year) * 365 + (day.dayOfYear - this.dayOfYear);
    while (true) {
      const check = new Day(this.year, this.month, this.day + guess);

      if (check.gt(day)) {
        guess -= 1;
      } else if (check.lt(day)) {
        guess += 1;
      } else {
        return guess;
      }
    }
  }

  // compare this date with another, to be used in a Array.sort() callback to ensure that the results are sorted so that `this` is sorted before `other`.
  compare(other: Day) {
    if (this.lt(other)) {
      return -1;
    }

    if (this.gt(other)) {
      return 1;
    }

    return 0;
  }
}
