import { jest, describe, it, expect } from "@jest/globals";
import { Day } from "@spoot/day";
import { Schedule, Segment, sliceSegments, printSegments } from "./Schedule";

describe("sliceSegments", () => {
  it("returns a subset of the segments defined by the bounds", () => {
    const slice = sliceSegments(
      [
        {
          startingAt: Day.from("2020-01-01"),
          endingBefore: Day.from("2020-02-01"),
          data: {},
        },
        {
          startingAt: Day.from("2020-02-01"),
          endingBefore: Day.from("2020-03-01"),
          data: {},
        },
        {
          startingAt: Day.from("2020-03-01"),
          endingBefore: Day.from("2020-04-01"),
          data: {},
        },
      ],
      {
        startingAt: Day.from("2020-01-15"),
        endingBefore: Day.from("2020-03-15"),
      },
    );

    expect(printSegments(slice)).toMatchSnapshot();
  });
});

describe("Schedule#apply", () => {
  it("calls map function with existing segments or null for each time segment within the bounds", () => {
    type T = { number: number };
    let s = Schedule.from<T>([]);
    const mock = jest.fn(
      (
        startingAt: Day,
        endingBefore: Day,
        existing: T | undefined,
      ): Segment<T> => ({
        startingAt,
        endingBefore,
        data: {
          number: existing ? existing.number + 1 : 1,
        },
      }),
    );

    s = s.apply(
      {
        startingAt: Day.from("2020-01-01"),
        endingBefore: Day.from("2021-01-01"),
      },
      mock,
    );

    expect(Schedule.print(s)).toMatchSnapshot();
    expect(mock).toHaveBeenCalledTimes(1);
    mock.mockClear();

    s = s.apply(
      {
        startingAt: Day.from("2020-02-01"),
        endingBefore: Day.from("2020-03-01"),
      },
      mock,
    );

    expect(Schedule.print(s)).toMatchSnapshot();
    expect(mock).toHaveBeenCalledTimes(1);
    mock.mockClear();

    s = s.apply(
      {
        startingAt: Day.from("2020-01-15"),
        endingBefore: Day.from("2020-03-16"),
      },
      mock,
    );

    expect(Schedule.print(s)).toMatchSnapshot();
    expect(mock).toHaveBeenCalledTimes(3);
  });
});
