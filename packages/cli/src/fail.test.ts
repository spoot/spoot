import { jest, describe, test, expect } from "@jest/globals";
import { fail } from "./fail";

describe("fail", () => {
  test("exits the process", () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const procSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((): never => {
        throw new Error("process.exit");
      });

    expect(() => fail("foo")).toThrow();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith("FATAL:", "foo");

    expect(procSpy).toHaveBeenCalledTimes(1);
    expect(procSpy).toHaveBeenCalledWith(1);
  });
});
