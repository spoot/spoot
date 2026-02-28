import { Rx } from "./rxjs";

export function log$<T>(
  msgOrFn: string | ((value: T) => string),
): Rx.MonoTypeOperatorFunction<T> {
  return (source) =>
    source.pipe(
      Rx.tap((value) => {
        if (typeof msgOrFn === "string") {
          console.log(msgOrFn);
        } else {
          console.log(msgOrFn(value));
        }
      }),
    );
}
