import { Rx } from "./rxjs";

/**
 * Match a sequence of values. A specific value must be received a number of times
 * within the specified time frame (in ms). If the sequence is broken or a sufficient
 * number of items is not recived before the time limit, the sequence is invalidated
 * and must be started again.
 */
export function matchSequence<T extends object | string | number | boolean>(
  match: T | ((t: T) => boolean),
  count: number,
  within: number,
): (source: Rx.Observable<T>) => Rx.Observable<void> {
  return (source) =>
    source.pipe(
      Rx.scan(
        (acc, value) => {
          if (typeof match === "function" ? match(value) : value !== match) {
            return {
              start: null,
              seq: [],
            };
          }

          if (
            acc.start != null &&
            acc.start >= Date.now() - within &&
            acc.seq.length < count
          ) {
            return {
              start: acc.start,
              seq: [...acc.seq, value],
            };
          }

          return {
            start: Date.now(),
            seq: [value],
          };
        },
        { start: null as number | null, seq: [] as T[] },
      ),
      Rx.filter((acc) => acc.seq.length === count),
      Rx.map(() => undefined),
    );
}
