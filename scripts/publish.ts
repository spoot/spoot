/**
 * Automated release script for the @spoot monorepo.
 * Run with: node scripts/publish.ts
 *
 * For each package:
 *   - Finds the oldest commit in git history where package.json already
 *     carries the current version.  That commit is the publish baseline.
 *   - If nothing has changed since that commit: skip.
 *   - If something changed: ask Gemini to determine the version bump type,
 *     then bump version, update CHANGELOG, commit, tag, and publish.
 *   - If no baseline commit exists (truly new package): publish at current
 *     version with no AI analysis needed.
 *
 * Tags are still created and pushed after each release so the git history
 * stays annotated, but they are not relied on for change detection — the
 * version field in package.json and the git log are the source of truth.
 *
 * Inter-package dependency cascades: when a package releases, its dependents
 * that haven't changed independently receive a patch bump so their published
 * package.json references the correct dep version.
 *
 * Credentials are loaded from .env.local when present (local dev), and from
 * environment variables in CI. See .env.local.example for the required vars.
 *
 * Commit messages (subject + body) since the last tag are included in the
 * prompt so hints like "BREAKING CHANGE" or "this is a major change" are
 * picked up automatically.
 *
 * The model is given two tools — read_file and grep — to inspect source files
 * when the diff alone is not enough context. Tool arguments are always passed
 * as separate argv elements via execFileSync (never shell-interpolated) so the
 * remote model cannot inject shell commands.
 *
 * Packages whose diff since the last tag contains only test files (*.test.ts,
 * *.spec.ts, __tests__/, jest.config.js, etc.) are skipped outright — no AI
 * call is made because no runtime behaviour can have changed.
 *
 * AI analysis results are cached in ~/.cache/spoot-release-cache.json, keyed
 * by a SHA256 of (diff + commit log) for each package. In CI the cache file is
 * restored from the previous run via actions/cache, so repeated commits that
 * only touch test files don't re-invoke the AI.
 *
 * Gemini responses are validated against a Zod schema. On invalid JSON or a
 * schema mismatch the script retries up to MAX_PARSE_RETRIES times, appending
 * a correction message each time so the model can self-correct.
 *
 * Required env vars:
 *   CF_AI_GATEWAY_URL    Cloudflare AI Gateway base URL
 *                        e.g. https://gateway.ai.cloudflare.com/v1/acct/gw
 *   CF_AI_GATEWAY_TOKEN  Bearer token (cf-aig-authorization)
 *
 * Optional:
 *   DRY_RUN=1  Run the full AI analysis and print the release plan,
 *              but skip writing files, committing, and publishing.
 *   MODEL      Gemini model to use (default: gemini-2.5-flash)
 */

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";

// Load .env.local for local development (ignored by git, never present in CI)
if (existsSync(join(process.cwd(), ".env.local"))) {
  process.loadEnvFile(".env.local");
}

// ── types ────────────────────────────────────────────────────────────────────

const BumpTypeSchema = z.enum(["major", "minor", "patch", "none"]);
type BumpType = z.infer<typeof BumpTypeSchema>;

interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface Pkg {
  name: string;
  version: string;
  dir: string;
  pkgPath: string;
  json: PackageJson;
}

interface ReleaseDecision {
  pkg: Pkg;
  bump: BumpType;
  newVersion: string;
  changelogEntry: string;
  isNew: boolean;
  isAlreadyBumped: boolean; // version committed to git but npm publish failed
}

// ── config ───────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const DRY_RUN = process.env.DRY_RUN === "1";
const MODEL = process.env.MODEL ?? "gemini-2.5-flash";
const CACHE_PATH = join(homedir(), ".cache", "spoot-release-cache.json");

// Files matching any of these patterns are considered test-only changes.
// If ALL changed files in a package match, the package is skipped without
// any AI call — no runtime behaviour can have changed.
const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.[jt]sx?$/,   // *.test.ts, *.spec.tsx, etc.
  /__tests__\//,                // anything inside __tests__/
  /jest\.config\.[jt]s$/,
  /vitest\.config\.[jt]s$/,
  /\.test-d\.ts$/,              // tsd / type-level tests
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// ── git helpers ───────────────────────────────────────────────────────────────

function git(args: string, opts?: { stdio?: "inherit" }): string {
  const result = execSync(`git ${args}`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: opts?.stdio ?? ["pipe", "pipe", "pipe"],
  });
  return result ? result.trim() : "";
}

// ── npm registry helpers ──────────────────────────────────────────────────────

// Return the set of versions already published to npm for a given package.
// Returns an empty set if the package doesn't exist yet or the registry is
// unreachable.
function getPublishedVersions(pkgName: string): Set<string> {
  try {
    const out = execFileSync(
      "npm", ["view", pkgName, "versions", "--json"],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    const parsed: unknown = JSON.parse(out);
    if (typeof parsed === "string") return new Set([parsed]);
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
    return new Set();
  } catch {
    return new Set(); // not published yet, or registry unreachable
  }
}

// Walk git log for the package's package.json from newest commit to oldest.
// Find the most recent published version, then return the oldest consecutive
// commit that carries it (the actual release commit).  This avoids returning
// a post-release edit that happens to have the same version field.
// Returns null if no published version appears in history.
function getPublishedBaselineCommit(
  relDir: string,
  published: Set<string>,
): string | null {
  if (published.size === 0) return null;

  const shas = execFileSync(
    "git",
    ["log", "--format=%H", "--", `${relDir}/package.json`],
    { cwd: ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  // First pass: find the most recent published version in history
  let publishedVersion: string | null = null;
  for (const sha of shas) {
    try {
      const pkg: PackageJson = JSON.parse(
        execFileSync("git", ["show", `${sha}:${relDir}/package.json`], {
          cwd: ROOT,
          encoding: "utf8",
        }),
      );
      if (published.has(pkg.version)) {
        publishedVersion = pkg.version;
        break;
      }
    } catch {
      break;
    }
  }

  if (!publishedVersion) return null;

  // Second pass: find the intro commit for that version
  return getVersionIntroCommit(relDir, publishedVersion);
}

// Walk git log for the package's package.json from newest to oldest.
// Return the oldest commit where the package.json still carries `version`
// (i.e. the release commit that first introduced this version).
// Returns null if the version never appears in history.
function getVersionIntroCommit(relDir: string, version: string): string | null {
  const shas = execFileSync(
    "git",
    ["log", "--format=%H", "--", `${relDir}/package.json`],
    { cwd: ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  let introCommit: string | null = null;
  for (const sha of shas) {
    try {
      const pkg: PackageJson = JSON.parse(
        execFileSync("git", ["show", `${sha}:${relDir}/package.json`], {
          cwd: ROOT,
          encoding: "utf8",
        }),
      );
      if (pkg.version === version) {
        introCommit = sha; // keep walking back to find the oldest
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return introCommit;
}

function getDiff(relDir: string, since: string): string {
  try {
    return execFileSync(
      "git",
      ["diff", `${since}..HEAD`, "--", relDir],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch {
    return "";
  }
}

function getCommitLog(relDir: string, since: string): string {
  try {
    return execFileSync(
      "git",
      ["log", `${since}..HEAD`, "--format=%s%n%b", "--", relDir],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}

function getChangedFiles(relDir: string, since: string): string[] {
  try {
    return execFileSync(
      "git",
      ["diff", "--name-only", `${since}..HEAD`, "--", relDir],
      { cwd: ROOT, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isTestOnlyChange(files: string[]): boolean {
  return files.length > 0 && files.every((f) => TEST_FILE_PATTERNS.some((p) => p.test(f)));
}

// ── package discovery ─────────────────────────────────────────────────────────

function getPackages(): Pkg[] {
  const pkgsDir = join(ROOT, "packages");
  return readdirSync(pkgsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = join(pkgsDir, d.name);
      const pkgPath = join(dir, "package.json");
      const json: PackageJson = JSON.parse(readFileSync(pkgPath, "utf8"));
      return { name: json.name, version: json.version, dir, pkgPath, json };
    });
}

// ── version helpers ───────────────────────────────────────────────────────────

function bumpVersion(version: string, bump: Exclude<BumpType, "none">): string {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (bump) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

// ── changelog ─────────────────────────────────────────────────────────────────

function makeChangelogEntry(
  newVersion: string,
  summary: string,
  details: string[],
  date: string,
): string {
  const bullets = details.length > 0 ? details : [summary];
  return [`## [${newVersion}] - ${date}`, "", ...bullets.map((b) => `- ${b}`), ""].join("\n");
}

function prependChangelog(pkgDir: string, entry: string): void {
  const path = join(pkgDir, "CHANGELOG.md");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "# Changelog\n\n";
  const lines = existing.split("\n");
  const insertAt = lines.findIndex((l, i) => i > 0 && l.startsWith("## "));
  if (insertAt === -1) {
    writeFileSync(path, existing.trimEnd() + "\n\n" + entry);
  } else {
    lines.splice(insertAt, 0, entry);
    writeFileSync(path, lines.join("\n"));
  }
}

// ── gemini via cloudflare ai gateway ─────────────────────────────────────────

const GeminiResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("analysis"),
    bump: BumpTypeSchema,
    summary: z.string().describe("One-line summary of changes in past tense"),
    details: z.array(z.string()).describe("List of specific changes"),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string().describe("Explanation of why analysis could not be completed"),
  }),
]);

type GeminiAnalysis = Extract<z.infer<typeof GeminiResponseSchema>, { type: "analysis" }>;

const RESPONSE_SCHEMA = JSON.stringify(GeminiResponseSchema.toJSONSchema(), null, 2);

// ── analysis cache ────────────────────────────────────────────────────────────
// Results are stored in ~/.cache/spoot-release-cache.json, keyed by a SHA256
// of the diff + commit log for each package. In CI, actions/cache restores the
// file from the previous run so repeated test-only commits don't re-invoke the
// AI at all.

interface CacheEntry {
  result: GeminiAnalysis;
  savedAt: string;
}
interface CacheFile {
  v: number;
  entries: Record<string, CacheEntry>;
}

function loadCache(): Map<string, GeminiAnalysis> {
  try {
    const raw: CacheFile = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    if (raw.v !== 1) return new Map();
    return new Map(Object.entries(raw.entries).map(([k, v]) => [k, v.result]));
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<string, GeminiAnalysis>): void {
  const entries: Record<string, CacheEntry> = {};
  for (const [k, v] of cache) {
    entries[k] = { result: v, savedAt: new Date().toISOString() };
  }
  mkdirSync(resolve(CACHE_PATH, ".."), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify({ v: 1, entries }, null, 2));
}

function diffCacheKey(pkgName: string, diff: string, commitLog: string): string {
  return `${pkgName}:${createHash("sha256").update(`${diff}\0${commitLog}`).digest("hex")}`;
}

const MAX_PARSE_RETRIES = 3;
const MAX_TOOL_ITERATIONS = 20;

// Tool definitions sent to the model. Parameters are plain JSON Schema objects
// (not Zod) since these are part of the OpenAI API contract, not our validation.
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the repository. Returns the file contents.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path relative to the repository root",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "Search for a regex pattern in repository source files (.ts, .tsx, .js). " +
        "Searches recursively, excluding node_modules and dist.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regular expression to search for",
          },
          path: {
            type: "string",
            description:
              "File or directory to search, relative to the repo root. " +
              "Defaults to the package directory being analyzed.",
          },
          context_lines: {
            type: "integer",
            description: "Lines of context around each match (0–10, default 2)",
          },
          max_results: {
            type: "integer",
            description: "Maximum number of matching lines to return (1–100, default 20)",
          },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
];

// Execute a tool call from the model. All external inputs (file paths, grep
// patterns) come from the remote model, so we validate paths are within the
// repo and pass grep arguments as a plain array to execFileSync — never
// interpolated into a shell string — to prevent command injection.
function executeTool(name: string, rawArgs: unknown, pkgRelDir: string): string {
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  if (name === "read_file") {
    const filePath = String(args.path ?? "");
    const abs = resolve(ROOT, filePath);
    if (!abs.startsWith(ROOT + "/") && abs !== ROOT) {
      return "Error: path must be within the repository";
    }
    if (!existsSync(abs)) return "Error: file not found";
    const content = readFileSync(abs, "utf8");
    return content.length > 50_000 ? content.slice(0, 50_000) + "\n[...truncated]" : content;
  }

  if (name === "grep") {
    const pattern = String(args.pattern ?? "");
    if (!pattern) return "Error: pattern is required";

    const targetPath = args.path ? resolve(ROOT, String(args.path)) : join(ROOT, pkgRelDir);
    if (!targetPath.startsWith(ROOT + "/") && targetPath !== ROOT) {
      return "Error: path must be within the repository";
    }

    const contextLines = Math.min(10, Math.max(0, Number(args.context_lines ?? 2)));
    const maxResults = Math.min(100, Math.max(1, Number(args.max_results ?? 20)));

    // Arguments are passed as a plain array — never concatenated into a shell
    // string — so the model cannot inject additional shell commands.
    const grepArgs = [
      "-r",
      "--include=*.ts",
      "--include=*.tsx",
      "--include=*.js",
      "--exclude-dir=node_modules",
      "--exclude-dir=dist",
      "--exclude-dir=.git",
      "-C", String(contextLines),
      "-m", String(maxResults),
      pattern,
      targetPath,
    ];

    try {
      const output = execFileSync("grep", grepArgs, { encoding: "utf8" });
      return output.length > 20_000 ? output.slice(0, 20_000) + "\n[...truncated]" : output;
    } catch (e: unknown) {
      // exit code 1 means no matches, which is not an error
      if ((e as { status?: number }).status === 1) return "No matches found";
      return `grep error: ${(e as Error).message}`;
    }
  }

  return `Error: unknown tool "${name}"`;
}

async function analyzeWithGemini(
  pkg: Pkg,
  diff: string,
  commitLog: string,
): Promise<GeminiAnalysis> {
  const client = new OpenAI({
    apiKey: requireEnv("CF_AI_GATEWAY_TOKEN"),
    baseURL: `${requireEnv("CF_AI_GATEWAY_URL").replace(/\/$/, "")}/compat`,
  });

  const pkgRelDir = pkg.dir.slice(ROOT.length + 1);

  const initialMessage = `
You are a semantic versioning expert analyzing changes to an npm package.

Package: ${pkg.name}
Current version: ${pkg.version}

Commits since last release:
${commitLog || "(none)"}

Git diff since last release:
\`\`\`diff
${diff.slice(0, 30_000)}
\`\`\`

You have tools available to read files and search the source code if you need more context.

When you are ready, respond with valid JSON only — no markdown, no code fences.
Your response MUST conform to this JSON schema:

${RESPONSE_SCHEMA}

Rules for the "analysis" type:
- "major": Breaking API changes — removed/renamed exports, changed signatures
- "minor": New features, new exports, backward-compatible API additions
- "patch": Bug fixes, perf improvements, internal refactoring with no API change,
  dependency version changes in package.json
- "none": ONLY when the diff contains nothing that affects the published package.
  Changes to test files, README, or CI config are "none". But any change to src/
  files or to dependencies/peerDependencies in package.json MUST result in at
  least a "patch" bump — never "none".

Pay attention to commit messages — they may explicitly indicate the bump type
(e.g. "BREAKING CHANGE", "feat:", "fix:", or plain English like "this is a major change").
Use the "error" type if you cannot complete the analysis.
`.trim();

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "user", content: initialMessage },
  ];

  let toolIterations = 0;
  let parseAttempts = 0;

  while (true) {
    const response = await client.chat.completions.create({
      model: `google-ai-studio/${MODEL}`,
      messages,
      tools: TOOLS,
      // response_format cannot be combined with tools on the Cloudflare compat
      // endpoint. Code fences are stripped before JSON.parse as a fallback.
    });

    const choice = response.choices[0];

    // Model wants to use a tool — execute it and feed the result back.
    if (choice.finish_reason === "tool_calls") {
      if (++toolIterations > MAX_TOOL_ITERATIONS) {
        throw new Error(`Gemini exceeded the tool call limit (${MAX_TOOL_ITERATIONS})`);
      }
      messages.push(choice.message);
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = (
        choice.message.tool_calls ?? []
      ).map((call) => {
        if (call.type !== "function") {
          return { role: "tool" as const, tool_call_id: call.id, content: `Error: unsupported tool type "${call.type}"` };
        }
        let callArgs: unknown;
        try {
          callArgs = JSON.parse(call.function.arguments);
        } catch {
          callArgs = {};
        }
        return {
          role: "tool" as const,
          tool_call_id: call.id,
          content: executeTool(call.function.name, callArgs, pkgRelDir),
        };
      });
      messages.push(...toolResults);
      continue;
    }

    // Final response — parse and validate against the Zod schema.
    const raw = choice.message.content ?? "";
    messages.push({ role: "assistant", content: raw });

    // Strip markdown code fences (```json ... ```) that some models add
    // even when instructed not to, before attempting JSON.parse.
    const content = raw.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/m, "$1").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (++parseAttempts >= MAX_PARSE_RETRIES) {
        throw new Error(`Gemini did not return valid JSON after ${MAX_PARSE_RETRIES} attempts`);
      }
      messages.push({
        role: "user",
        content: `Attempt ${parseAttempts + 1} of ${MAX_PARSE_RETRIES}: your response was not valid JSON. You MUST respond with valid JSON only, exactly matching the schema provided.`,
      });
      continue;
    }

    const result = GeminiResponseSchema.safeParse(parsed);
    if (!result.success) {
      if (++parseAttempts >= MAX_PARSE_RETRIES) {
        throw new Error(
          `Gemini response failed schema validation after ${MAX_PARSE_RETRIES} attempts: ${result.error.message}`,
        );
      }
      messages.push({
        role: "user",
        content: `Attempt ${parseAttempts + 1} of ${MAX_PARSE_RETRIES}: your response did not match the required schema. Validation errors:\n${result.error.message}\n\nYou MUST respond with valid JSON exactly matching the schema.`,
      });
      continue;
    }

    if (result.data.type === "error") {
      throw new Error(`Gemini could not analyze ${pkg.name}: ${result.data.message}`);
    }

    return result.data;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const packages = getPackages();
  const today = new Date().toISOString().slice(0, 10);
  const decisions = new Map<string, ReleaseDecision>();
  const cache = loadCache();

  if (DRY_RUN) {
    console.log("\n🔍 DRY_RUN — analyzing with Gemini but skipping commit and publish\n");
  }

  // 1. Analyze each package ───────────────────────────────────────────────────
  console.log(`📦 Analyzing ${packages.length} packages...\n`);

  for (const pkg of packages) {
    const relDir = pkg.dir.slice(ROOT.length + 1);

    // Check npm for what's already published, then determine what needs to
    // be released.  Three cases:
    //
    //  1. Current version IS on npm → find baseline and check for new changes.
    //  2. Current version NOT on npm, but already committed to git (a prior run
    //     committed + tagged but crashed before npm publish) → re-publish.
    //  3. Current version NOT on npm and no intro commit → brand-new package.
    process.stdout.write(`  ${pkg.name}  checking registry...  `);
    const published = getPublishedVersions(pkg.name);

    let sinceCommit: string | null;

    if (!published.has(pkg.version)) {
      // Current version not on npm yet.
      const introCommit = getVersionIntroCommit(relDir, pkg.version);

      if (!introCommit) {
        // Never in git history: genuine first release.
        console.log(`NEW  →  ${pkg.version}`);
        decisions.set(pkg.name, {
          pkg,
          bump: "patch",
          newVersion: pkg.version,
          changelogEntry: `## [${pkg.version}] - ${today}\n\n- Initial release.\n`,
          isNew: true,
          isAlreadyBumped: false,
        });
        continue;
      }

      // Check for changes AFTER the version was committed to git.
      const postReleaseDiff = getDiff(relDir, introCommit);
      if (!postReleaseDiff.trim()) {
        // Already committed + tagged, no new changes — just re-publish.
        console.log(`unpublished  →  ${pkg.version}`);
        decisions.set(pkg.name, {
          pkg,
          bump: "patch",
          newVersion: pkg.version,
          changelogEntry: "",
          isNew: false,
          isAlreadyBumped: true,
        });
        continue;
      }

      // New changes on top of the committed-but-unpublished version.
      // Use the last published version as baseline so the AI sees ALL
      // unreleased changes, not just what came after the failed release commit.
      sinceCommit = getPublishedBaselineCommit(relDir, published) ?? introCommit;
    } else {
      // Current version is on npm — find the commit that introduced it
      // (the actual release commit) and check for new work since then.
      sinceCommit = getVersionIntroCommit(relDir, pkg.version);
      if (!sinceCommit) {
        console.log(`unchanged  (${pkg.version})`);
        continue;
      }
    }

    const diff = getDiff(relDir, sinceCommit);

    if (!diff.trim()) {
      console.log(`unchanged  (${pkg.version})`);
      continue;
    }

    // Skip immediately if every changed file is a test / config file — the AI
    // cannot learn anything new and no runtime behaviour has changed.
    const changedFiles = getChangedFiles(relDir, sinceCommit);
    if (isTestOnlyChange(changedFiles)) {
      console.log(`test-only  (${pkg.version})`);
      continue;
    }

    const commitLog = getCommitLog(relDir, sinceCommit);

    // Return a cached result if we've already analyzed this exact diff.
    // "none" results are not cached — the test-only check above handles
    // the common case, and re-analyzing is cheap insurance against a
    // prior false "none" from the AI.
    const cacheKey = diffCacheKey(pkg.name, diff, commitLog);
    const cached = cache.get(cacheKey);
    if (cached && cached.bump !== "none") {
      const cachedVersion = bumpVersion(pkg.version, cached.bump);
      console.log(`${cached.bump}  →  ${pkg.version}  →  ${cachedVersion}  [cached]`);
      console.log(`    ${cached.summary}`);
      decisions.set(pkg.name, {
        pkg,
        bump: cached.bump,
        newVersion: cachedVersion,
        changelogEntry: makeChangelogEntry(cachedVersion, cached.summary, cached.details, today),
        isNew: false,
        isAlreadyBumped: false,
      });
      continue;
    }

    process.stdout.write(`analyzing...  `);
    const analysis = await analyzeWithGemini(pkg, diff, commitLog);
    if (analysis.bump !== "none") {
      cache.set(cacheKey, analysis);
      saveCache(cache);
    }

    if (analysis.bump === "none") {
      console.log(`no release needed`);
      continue;
    }

    const newVersion = bumpVersion(pkg.version, analysis.bump);
    console.log(`${analysis.bump}  →  ${pkg.version}  →  ${newVersion}`);
    console.log(`    ${analysis.summary}`);

    decisions.set(pkg.name, {
      pkg,
      bump: analysis.bump,
      newVersion,
      changelogEntry: makeChangelogEntry(newVersion, analysis.summary, analysis.details, today),
      isNew: false,
      isAlreadyBumped: false,
    });
  }

  // 2. Cascade patch bumps to dependents ─────────────────────────────────────
  // Any package whose runtime dep is releasing needs a new version so consumers
  // get the correct dep version in the published package.json.
  let changed = true;
  while (changed) {
    changed = false;
    for (const pkg of packages) {
      if (decisions.has(pkg.name)) continue;

      const bumpingDeps = Object.keys(pkg.json.dependencies ?? {}).filter((dep) =>
        decisions.has(dep),
      );
      if (bumpingDeps.length === 0) continue;

      const newVersion = bumpVersion(pkg.version, "patch");
      const depList = bumpingDeps.map((d) => `${d}@${decisions.get(d)!.newVersion}`).join(", ");
      console.log(`  ${pkg.name}  cascade patch  →  ${newVersion}  (${depList})`);

      decisions.set(pkg.name, {
        pkg,
        bump: "patch",
        newVersion,
        changelogEntry: makeChangelogEntry(
          newVersion,
          "Update internal dependencies",
          bumpingDeps.map((d) => `Update ${d} to ${decisions.get(d)!.newVersion}`),
          today,
        ),
        isNew: false,
        isAlreadyBumped: false,
      });
      changed = true;
    }
  }

  if (decisions.size === 0) {
    console.log("\n✅ Nothing to release.\n");
    return;
  }

  console.log(`\n🚀 Release plan (${decisions.size} package(s)):\n`);
  for (const [, d] of decisions) {
    if (d.isAlreadyBumped) {
      console.log(`  ${d.pkg.name}  re-publish  ${d.newVersion}`);
    } else {
      const label = d.isNew ? "NEW" : d.bump;
      console.log(`  ${d.pkg.name}  ${label}  ${d.pkg.version} → ${d.newVersion}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n(DRY_RUN — stopping here)\n");
    return;
  }

  // 3. Write package.json + CHANGELOG ────────────────────────────────────────
  const newReleases = [...decisions.values()].filter((d) => !d.isAlreadyBumped);
  if (newReleases.length > 0) {
    console.log("\n✍️  Updating versions and changelogs...");
    for (const d of newReleases) {
      const updatedJson = { ...d.pkg.json, version: d.newVersion };
      writeFileSync(d.pkg.pkgPath, JSON.stringify(updatedJson, null, 2) + "\n");

      if (d.isNew) {
        writeFileSync(join(d.pkg.dir, "CHANGELOG.md"), `# Changelog\n\n${d.changelogEntry}`);
      } else {
        prependChangelog(d.pkg.dir, d.changelogEntry);
      }
    }
  }

  // 4. Build ──────────────────────────────────────────────────────────────────
  console.log("\n🔨 Building packages...");
  execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });

  // 5. Publish ────────────────────────────────────────────────────────────────
  // Strip pnpm-injected npm_config_* env vars before invoking npm directly —
  // they bleed through from the pnpm parent process and cause "Unknown config"
  // warnings in npm 10+ (catalog, verify-deps-before-run, _jsr-registry, etc.).
  const publishEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("npm_config_")),
  );
  const NPM_PUBLISH_RETRIES = 3;
  const NPM_RETRY_DELAY_MS = 5_000;
  const published: ReleaseDecision[] = [];
  const failed: string[] = [];

  console.log("\n📤 Publishing to npm...\n");
  for (const [, d] of decisions) {
    console.log(`  ${d.pkg.name}@${d.newVersion}`);

    // Skip publish if this version already exists on npm (e.g. a prior run
    // published successfully but crashed before committing to git).
    const alreadyOnNpm = getPublishedVersions(d.pkg.name).has(d.newVersion);
    if (alreadyOnNpm) {
      console.log(`  ✓ Already on npm, skipping publish`);
      published.push(d);
      continue;
    }

    let ok = false;
    for (let attempt = 1; attempt <= NPM_PUBLISH_RETRIES; attempt++) {
      try {
        execSync(`npm publish --access public`, {
          cwd: d.pkg.dir,
          stdio: "inherit",
          env: publishEnv,
        });
        ok = true;
        break;
      } catch {
        if (attempt < NPM_PUBLISH_RETRIES) {
          console.log(`  ⚠ Publish attempt ${attempt} failed, retrying in ${NPM_RETRY_DELAY_MS / 1000}s...`);
          execSync(`sleep ${NPM_RETRY_DELAY_MS / 1000}`);
        } else {
          console.error(`  ✗ Failed to publish ${d.pkg.name}@${d.newVersion} after ${NPM_PUBLISH_RETRIES} attempts`);
          // Rollback the uncommitted version bump so the next run re-analyzes cleanly.
          if (!d.isAlreadyBumped) {
            const relDir = d.pkg.dir.slice(ROOT.length + 1);
            git(`checkout -- ${relDir}/package.json ${relDir}/CHANGELOG.md`);
            console.log(`  ↩ Rolled back version bump for ${d.pkg.name}`);
          }
          failed.push(`${d.pkg.name}@${d.newVersion}`);
        }
      }
    }

    if (ok) published.push(d);
  }

  // 7. Commit + tag + push ────────────────────────────────────────────────────
  const toCommit = published.filter((d) => !d.isAlreadyBumped);
  if (toCommit.length > 0) {
    const releaseList = toCommit.map((d) => `${d.pkg.name}@${d.newVersion}`).join(", ");
    console.log("\n📝 Committing...");
    git(`config user.email "github-actions[bot]@users.noreply.github.com"`);
    git(`config user.name "github-actions[bot]"`);
    git(`add -A`);
    git(`commit -m "chore: release ${releaseList} [skip ci]"`);

    for (const d of toCommit) {
      const tag = `${d.pkg.name}@${d.newVersion}`;
      execFileSync("git", ["tag", "-a", tag, "-m", tag], { cwd: ROOT });
      console.log(`  Tagged: ${tag}`);
    }

    console.log("\n⬆️  Pushing...");
    git(`push origin HEAD:main --follow-tags`, { stdio: "inherit" });
  } else if (published.length > 0) {
    console.log("\n(No new commits — all packages were re-published from a prior release commit)");
  }

  if (failed.length > 0) {
    console.error(`\n❌ Failed to publish ${failed.length} package(s): ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log("\n✅ Done!\n");
}

main().catch((err: unknown) => {
  console.error("\n❌ Release failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
