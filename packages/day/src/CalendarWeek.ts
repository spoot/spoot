import { Day } from "./Day";

export class CalendarWeek {
  static allSpanning(start: Day, end: Day) {
    if (!start.lte(end)) {
      throw new Error("start must be less than or equal to end");
    }

    const weeks = [start.calendarWeek];

    for (
      let cursor = start.nextWeek;
      cursor.lte(end);
      cursor = cursor.nextWeek
    ) {
      weeks.push(cursor.calendarWeek);
    }

    return weeks;
  }

  constructor(private readonly start: Day) {
    if (this.start.dayOfWeek !== 0) {
      throw new Error("CalendarWeek must start on a Sunday");
    }
  }

  get next() {
    return new CalendarWeek(this.start.add(0, 0, 7));
  }

  get previous() {
    return new CalendarWeek(this.start.add(0, 0, -7));
  }

  get firstDay() {
    return this.start;
  }

  get lastDay() {
    return this.start.add(0, 0, 6);
  }

  toString() {
    return `${this.start.print()} - ${this.start.add(0, 0, 6).print()}`;
  }

  get days() {
    return [
      this.start,
      this.start.add(0, 0, 1),
      this.start.add(0, 0, 2),
      this.start.add(0, 0, 3),
      this.start.add(0, 0, 4),
      this.start.add(0, 0, 5),
      this.start.add(0, 0, 6),
    ];
  }
}
