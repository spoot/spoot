import { fail } from "./fail";

export class Args {
  constructor(
    public readonly flags: Flag[],
    public readonly positional: string[],
  ) {}

  get(key: string) {
    return this.flags.find((f) => f.key === key);
  }

  str(key: string): string | null {
    const f = this.get(key);
    if (!f) return null;

    if (f.value !== null && typeof f.value !== "string") {
      fail(`expected string for --${key} flag`);
    }

    return f?.value ?? null;
  }

  bool(key: string): boolean | null {
    const f = this.get(key);
    if (!f) return null;

    if (f.value !== null && typeof f.value !== "boolean") {
      fail(`expected boolean for --${key} flag`);
    }

    return f?.value ?? null;
  }
}

class Flag {
  static init(key: string, value: string | boolean): Flag[] {
    if (key.startsWith("no-")) {
      return [new Flag(key, value), new Flag(key.slice(3), !value)];
    }

    return [new Flag(key, value)];
  }

  constructor(
    public readonly key: string,
    public readonly value: string | boolean,
  ) {}
}

export function readArgv(): Args {
  const input = [...process.argv.slice(2)];
  const flags: Flag[] = [];
  const args: string[] = [];

  for (let chunk = input.shift(); chunk !== undefined; chunk = input.shift()) {
    const flag = chunk.match(/^--?([^=]+)(?:=(.+))?$/);

    if (flag) {
      const [key, value] = flag.slice(1);

      if (
        value == undefined &&
        (input.length == 0 || input.at(0)?.startsWith("-"))
      ) {
        flags.push(...Flag.init(key, true));
      } else {
        flags.push(...Flag.init(key, value ?? input.shift()!));
      }
    } else {
      args.push(chunk);
    }
  }

  return new Args(flags, args);
}
