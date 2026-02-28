import { describe, expect, it } from "@jest/globals";
import { Day } from "./Day";

describe("Day", () => {
  describe("#diff()", () => {
    it("diffs two days in the same month", () => {
      const day1 = new Day(2022, 0, 1);
      const day2 = new Day(2022, 0, 15);
      expect(day1.diff(day2)).toBe(14);
    });

    it("diffs two days in different months", () => {
      const day1 = new Day(2022, 0, 1);
      const day2 = new Day(2022, 1, 1);
      expect(day1.diff(day2)).toBe(31);
    });

    it("diffs two days months apart", () => {
      const day1 = new Day(2022, 0, 1);
      const day2 = new Day(2022, 6, 15);
      expect(day1.diff(day2)).toBe(195);
    });

    it("diffs two days in the different years", () => {
      const day1 = new Day(2022, 0, 1);
      const day2 = new Day(2023, 6, 15);
      expect(day1.diff(day2)).toBe(560);
    });

    it("handles leap year", () => {
      const day1 = new Day(2020, 1, 1);
      const day2 = new Day(2020, 2, 1);
      expect(day1.diff(day2)).toBe(29);
    });

    it("handles the opposite direction", () => {
      const day1 = new Day(2022, 0, 15);
      const day2 = new Day(2022, 0, 1);
      expect(day1.diff(day2)).toBe(-14);
    });
  });
});
