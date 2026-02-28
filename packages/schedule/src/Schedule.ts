import fastDeepEqual from "fast-deep-equal";
import { Day } from "@spoot/day";

export interface Segment<T> extends Bounded {
  startingAt: Day;
  endingBefore: Day;
  data: T;
  meta?: Record<string, unknown>;
}

interface Bounded {
  startingAt: Day;
  endingBefore: Day;
}

export class Schedule<T> {
  static from<T>(iterable: Iterable<Segment<T>>) {
    let segments: Segment<T>[] = [];
    for (const segment of iterable) {
      segments = concatSegments(segments, [segment]);
    }
    return new Schedule(segments);
  }

  static async asyncFrom<T>(iterable: AsyncIterable<Segment<T>>) {
    let segments: Segment<T>[] = [];
    for await (const segment of iterable) {
      segments = concatSegments(segments, [segment]);
    }
    return new Schedule(segments);
  }

  static print<T>(schedule: Schedule<T>) {
    return printSegments(schedule.segments);
  }

  private constructor(public readonly segments: Segment<T>[] = []) {}

  get startingAt() {
    return this.segments.at(0)?.startingAt;
  }

  get endingBefore() {
    return this.segments.at(-1)?.endingBefore;
  }

  get bounds() {
    return [this.startingAt, this.endingBefore] as const;
  }

  at(moment: Day) {
    return this.segments.find(
      (seg) => seg.startingAt.lte(moment) && seg.endingBefore.gt(moment),
    );
  }

  append(segment: Segment<T>) {
    return new Schedule(concatSegments(this.segments, [segment]));
  }

  intersects(segment: Bounded) {
    const [startingAt, endingBefore] = this.bounds;
    return (
      startingAt &&
      endingBefore &&
      intersects({ startingAt, endingBefore }, segment)
    );
  }

  set(segment: Segment<T>) {
    if (this.segments.length && !this.intersects(segment)) {
      throw new Error(
        `Unable to set a segment outside the bounds of the schedule: ${this.startingAt} -> ${this.endingBefore} vs ${segment.startingAt} -> ${segment.endingBefore}`,
      );
    }

    let updated =
      this.startingAt && this.startingAt.lt(segment.startingAt)
        ? sliceSegments(this.segments, {
            startingAt: this.startingAt,
            endingBefore: segment.startingAt,
          })
        : [];

    updated = concatSegments(updated, [segment]);

    return new Schedule(
      concatSegments(
        updated,
        this.endingBefore && segment.endingBefore.lt(this.endingBefore)
          ? sliceSegments(this.segments, {
              startingAt: segment.endingBefore,
              endingBefore: this.endingBefore,
            })
          : [],
      ),
    );
  }

  apply(
    bounds: Bounded,
    fn: (
      startingAt: Day,
      endingBefore: Day,
      existing: T | undefined,
    ) => Segment<T>,
  ) {
    const [startingAt, endingBefore] = this.bounds;

    if (!startingAt || !endingBefore) {
      return new Schedule([
        fn(bounds.startingAt, bounds.endingBefore, undefined),
      ]);
    }

    return new Schedule([
      ...(startingAt.lt(bounds.startingAt)
        ? sliceSegments(this.segments, {
            startingAt,
            endingBefore: bounds.startingAt,
          })
        : bounds.startingAt.lt(startingAt)
          ? [fn(bounds.startingAt, startingAt, undefined)]
          : []),

      ...sliceSegments(this.segments, bounds).map((segment) =>
        fn(segment.startingAt, segment.endingBefore, segment.data),
      ),

      ...(bounds.endingBefore.lt(endingBefore)
        ? sliceSegments(this.segments, {
            startingAt: bounds.endingBefore,
            endingBefore,
          })
        : bounds.endingBefore.gt(endingBefore)
          ? [fn(endingBefore, bounds.endingBefore, undefined)]
          : []),
    ]);
  }
}

export function intersects(a: Bounded, b: Bounded) {
  return a.startingAt.lt(b.endingBefore) && b.startingAt.lt(a.endingBefore);
}

export function isSubset(subset: Bounded, superset: Bounded) {
  return (
    superset.startingAt.lte(subset.startingAt) &&
    superset.endingBefore.gte(subset.endingBefore)
  );
}

export function printSegments(segments: Segment<unknown>[]) {
  return segments
    .map(
      (seg) =>
        `${seg.startingAt.toJSON()} -> ${seg.endingBefore.toJSON()}: ${JSON.stringify(seg.data)}`,
    )
    .join("\n");
}

export function sliceSegments<T extends Bounded>(
  segments: T[],
  bounds: Bounded,
) {
  return segments.flatMap((segment) => {
    if (isSubset(segment, bounds)) {
      return [segment];
    }

    if (intersects(segment, bounds)) {
      const { startingAt, endingBefore, ...rest } = segment;
      return {
        ...rest,
        startingAt: Day.max(startingAt, bounds.startingAt),
        endingBefore: Day.min(endingBefore, bounds.endingBefore),
      };
    }

    return [];
  });
}

export function concatSegments<T>(a: Segment<T>[], b: Segment<T>[]) {
  const aLast = a.at(-1);
  const bFirst = b.at(0);

  if (aLast && bFirst) {
    if (aLast.endingBefore.neq(bFirst.startingAt)) {
      throw new Error(
        `Unable to concatenate segments with a gap between them: ${aLast.endingBefore} -> ${bFirst.startingAt}`,
      );
    }

    if (fastDeepEqual(aLast.data, bFirst.data)) {
      const { startingAt, endingBefore: _, ...rest } = aLast;
      return [
        ...a.slice(0, -1),
        { startingAt, endingBefore: bFirst.endingBefore, ...rest },
        ...b.slice(1),
      ];
    }
  }

  return [...a, ...b];
}
