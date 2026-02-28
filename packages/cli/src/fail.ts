import { format } from "util";

export function fail(...args: unknown[]): never {
  console.error("FATAL:", format(...args));
  process.exit(1);
}
