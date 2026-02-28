import { Args } from "./Args";

export class Command {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly fn: (args: Args) => Promise<void>,
  ) {}
}
