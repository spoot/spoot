import { describe, expect, it } from "@jest/globals";
import { DaySelector } from "./DaySelector";
import { Day } from "./Day";

const TEST_START = new Day(2022, 6, 1);
const TEST_END = new Day(2024, 6, 31);

function testCalendar(selector: DaySelector) {
  const pattern: Array<{ from: Day; to: Day; matching: boolean }> = [];

  for (let pos = TEST_START; pos.lte(TEST_END); pos = pos.nextDay) {
    const matching = selector.match(pos);
    const current = pattern.at(-1);
    if (current?.matching !== matching) {
      pattern.push({
        from: pos,
        to: pos,
        matching,
      });
    } else {
      current.to = pos;
    }
  }

  return pattern.map(({ from, to, matching }) => [
    from.toJSON(),
    to.toJSON(),
    matching ? "X" : "O",
  ]);
}

describe("DaySelector", () => {
  describe("lower bound is January and upper bound is undefined", () => {
    it("matches days in January in any year", () => {
      const selector = new DaySelector(["jan"]);
      const result = testCalendar(selector);

      expect(result).toEqual([
        ["2022-07-01", "2022-12-31", "O"],
        ["2023-01-01", "2023-01-31", "X"],
        ["2023-02-01", "2023-12-31", "O"],
        ["2024-01-01", "2024-01-31", "X"],
        ["2024-02-01", "2024-07-31", "O"],
      ]);
    });
  });

  describe("lower bound is January and upper bound is December", () => {
    it("matches all days between January and December in any year", () => {
      const result = testCalendar(new DaySelector(["jan"], ["dec"]));
      expect(result).toEqual([["2022-07-01", "2024-07-31", "X"]]);
    });
  });

  describe("bounds wrap around the end of the year", () => {
    it("matches days outside the last month and the first month if they were reversed", () => {
      const result = testCalendar(new DaySelector(["oct"], ["feb"]));
      expect(result).toEqual([
        ["2022-07-01", "2022-09-30", "O"],
        ["2022-10-01", "2023-02-28", "X"],
        ["2023-03-01", "2023-09-30", "O"],
        ["2023-10-01", "2024-02-29", "X"], // 2024 is a leap year so feb has 29 days
        ["2024-03-01", "2024-07-31", "O"],
      ]);
    });
  });

  describe("lower bound is January 24, 2024, and upper bound is July", () => {
    const selector = new DaySelector(["jan", 24, 2024], ["jun", 15, 2024]);

    it("Only matches days betwen jan-24-2024 and jul-31-2024", () => {
      const result = testCalendar(selector);
      expect(result).toEqual([
        ["2022-07-01", "2024-01-23", "O"],
        ["2024-01-24", "2024-06-15", "X"],
        ["2024-06-16", "2024-07-31", "O"],
      ]);
    });
  });

  describe("lower bound includes year, month, and day, and upper bound is undefined", () => {
    it("matches a specific day", () => {
      const result = testCalendar(new DaySelector(["jan", 24, 2024]));
      expect(result).toEqual([
        ["2022-07-01", "2024-01-23", "O"],
        ["2024-01-24", "2024-01-24", "X"],
        ["2024-01-25", "2024-07-31", "O"],
      ]);
    });
  });

  describe("adjacent month ranges don't overlap at boundaries", () => {
    it("march 31 matches jan-mar but not apr-may", () => {
      const janMar = new DaySelector(["jan"], ["mar"]);
      const aprMay = new DaySelector(["apr"], ["may"]);
      const mar31 = new Day(2026, 2, 31);
      const apr1 = new Day(2026, 3, 1);

      expect(janMar.match(mar31)).toBe(true);
      expect(aprMay.match(mar31)).toBe(false);
      expect(janMar.match(apr1)).toBe(false);
      expect(aprMay.match(apr1)).toBe(true);
    });

    it("feb 28 in non-leap year matches jan-feb but not mar-apr", () => {
      const janFeb = new DaySelector(["jan"], ["feb"]);
      const marApr = new DaySelector(["mar"], ["apr"]);
      const feb28 = new Day(2025, 1, 28); // 2025 is not a leap year

      expect(janFeb.match(feb28)).toBe(true);
      expect(marApr.match(feb28)).toBe(false);
    });

    it("feb 29 in leap year matches jan-feb but not mar-apr", () => {
      const janFeb = new DaySelector(["jan"], ["feb"]);
      const marApr = new DaySelector(["mar"], ["apr"]);
      const feb29 = new Day(2024, 1, 29); // 2024 is a leap year

      expect(janFeb.match(feb29)).toBe(true);
      expect(marApr.match(feb29)).toBe(false);
    });
  });

  describe("lower bound includes month and day, and upper bound is undefined", () => {
    it("matches a specific day in any year", () => {
      const result = testCalendar(new DaySelector(["jan", 24]));

      expect(result).toEqual([
        ["2022-07-01", "2023-01-23", "O"],
        ["2023-01-24", "2023-01-24", "X"],
        ["2023-01-25", "2024-01-23", "O"],
        ["2024-01-24", "2024-01-24", "X"],
        ["2024-01-25", "2024-07-31", "O"],
      ]);
    });
  });
});
