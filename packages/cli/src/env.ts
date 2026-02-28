import { fail } from "./fail";

export function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) fail(`No ${key} key found in ENV`);
  return value;
}
