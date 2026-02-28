import * as Util from "util";

export const logger = {
  info: (...args: unknown[]) => {
    console.info(Util.format(...args).replaceAll("\n", "\\n"));
  },
  error: (...args: unknown[]) => {
    console.info(`ERROR ${Util.format(...args).replaceAll("\n", "\\n")}`);
  },
};
