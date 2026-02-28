import Path from "path";
import Fs from "fs";
import { format } from "util";
import { Command } from "./Command";
import { fail } from "./fail";
import { Args, readArgv } from "./Args";

export class Cli {
  private readonly commands: Command[] = [];

  usageFail(...args: unknown[]): never {
    console.error("Invalid usage:", format(...args));
    console.log(`
Usage: <cmd> <args>

Commands:
${this.commands.map((c) => `  ${c.name}: ${c.description}`).join("\n")}
`);
    process.exit(1);
  }

  addCommand(
    name: string,
    props: {
      description: string;
      fn: (this: Command, args: Args) => Promise<void>;
    },
  ) {
    this.commands.push(new Command(name, props.description, props.fn));
  }

  async loadCommands(dirname: string, cmdDir: string) {
    const directory = Path.resolve(dirname, cmdDir);
    for (const file of Fs.readdirSync(directory, { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith(".ts")) {
        await import(Path.resolve(directory, file.name));
      }
    }
  }

  loadAndRun(dirname: string, cmdDir: string) {
    this.loadCommands(dirname, cmdDir)
      .then(() => this.run())
      .catch((error) => fail("Failed to load commands", error));
  }

  run() {
    const unhandled = (error: unknown) => fail("Unhandled exception", error);

    try {
      const args = readArgv();
      const commandName = args.positional.shift();
      if (!commandName) {
        this.usageFail("No command specified");
      }

      const command = this.commands.find((c) => c.name === commandName);
      if (!command) {
        this.usageFail(`Unknown command: ${commandName}`);
      }

      command.fn(args).catch(unhandled);
    } catch (error) {
      unhandled(error);
    }
  }
}
