import { Day } from "./Day";

export class Week {
  static from(start: Day | string) {
    return new Week(Day.from(start));
  }

  constructor(public start: Day) {
    if (this.start.dayOfWeek !== 0) {
      throw new Error("start must be a Sunday");
    }
  }

  get end() {
    return this.start.add(0, 0, 6);
  }

  get numberInYear() {
    return Math.floor(this.start.dayOfYear / 7);
  }

  get next() {
    return new Week(this.start.add(0, 0, 7));
  }

  print() {
    return this.start.print();
  }
}
