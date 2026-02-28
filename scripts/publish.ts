/**
 * Automated release script for the @spoot monorepo.
 * Run with: node scripts/publish.ts
 *
 * For each package:
 *   - If never published (no git tag): publish at current version, no AI needed
 *   - If previously published and changed: ask Gemini to determine the version
 *     bump type, then bump version, update CHANGELOG, commit, tag, and publish
 *   - If previously published and unchanged: skip
 *
 * Inter-package dependency cascades: when a package releases, its dependents
 * that haven't changed independently receive a patch bump so their published
 * package.json references the correct dep version.
 *
 * Credentials are loaded from .env.local when present (local dev), and from
 * environment variables in CI. See .env.local.example for the required vars.
 *
 * Gemini responses are validated against a Zod schema. On invalid JSON or a
 * schema mismatch the script retries up to MAX_RETRIES times, appending a
 * reminder message each time so the model can self-correct.
 *
 * Required env vars:
 *   CF_AI_GATEWAY_URL    Cloudflare AI Gateway base URL
 *                        e.g. https://gateway.ai.cloudflare.com/v1/acct/gw
 *   CF_AI_GATEWAY_TOKEN  Bearer token (cf-aig-authorization)
 *
 * Optional:
 *   DRY_RUN=1  Run the full AI analysis and print the release plan,
 *              but skip writing files, committing, and publishing.
 *   MODEL      Gemini model to use (default: gemini-2.0-flash)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
}

// ── config ───────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const DRY_RUN = process.env.DRY_RUN === "1";
const MODEL = process.env.MODEL ?? "gemini-2.0-flash";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// ── git helpers ───────────────────────────────────────────────────────────────

function git(args: string, opts?: { stdio?: "inherit" }): string {
  return execSync(`git ${args}`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: opts?.stdio ?? ["pipe", "pipe", "pipe"],
  }).trim();
}

function getLastTag(packageName: string): string | null {
  const tags = git(`tag -l "${packageName}@*" --sort=-version:refname`)
    .split("\n")
    .filter(Boolean);
  return tags[0] ?? null;
}

function getDiff(relDir: string, sinceTag: string): string {
  try {
    return execSync(`git diff ${sinceTag}..HEAD -- ${relDir}`, {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch {
    return "";
  }
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

const MAX_RETRIES = 3;

async function analyzeWithGemini(pkg: Pkg, diff: string): Promise<GeminiAnalysis> {
  const client = new OpenAI({
    apiKey: requireEnv("CF_AI_GATEWAY_TOKEN"),
    baseURL: `${requireEnv("CF_AI_GATEWAY_URL").replace(/\/$/, "")}/compat`,
  });

  const initialMessage = `
You are a semantic versioning expert analyzing a git diff for an npm package.

Package: ${pkg.name}
Current version: ${pkg.version}

Git diff since last release:
\`\`\`diff
${diff.slice(0, 30_000)}
\`\`\`

Determine the appropriate semantic version bump. Respond with valid JSON only — no markdown, no code fences.
Your response MUST conform to this JSON schema:

${RESPONSE_SCHEMA}

Rules for the "analysis" type:
- "major": Breaking API changes — removed/renamed exports, changed signatures
- "minor": New features, new exports, backward-compatible API additions
- "patch": Bug fixes, perf improvements, internal refactoring with no API change
- "none": Only test files, README, CI config, or whitespace — no runtime change

Only src/ changes matter for the bump type. If you cannot complete the analysis, respond with the "error" type.
`.trim();

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "user", content: initialMessage },
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await client.chat.completions.create({
      model: `google-ai-studio/${MODEL}`,
      messages,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message.content ?? "";
    messages.push({ role: "assistant", content });

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (attempt < MAX_RETRIES) {
        messages.push({
          role: "user",
          content: `Attempt ${attempt + 1} of ${MAX_RETRIES}: your response was not valid JSON. You MUST respond with valid JSON only, exactly matching the schema provided.`,
        });
        continue;
      }
      throw new Error(`Gemini did not return valid JSON after ${MAX_RETRIES} attempts`);
    }

    const result = GeminiResponseSchema.safeParse(parsed);
    if (!result.success) {
      if (attempt < MAX_RETRIES) {
        messages.push({
          role: "user",
          content: `Attempt ${attempt + 1} of ${MAX_RETRIES}: your response did not match the required schema. Validation errors:\n${result.error.message}\n\nYou MUST respond with valid JSON exactly matching the schema.`,
        });
        continue;
      }
      throw new Error(
        `Gemini response failed schema validation after ${MAX_RETRIES} attempts: ${result.error.message}`,
      );
    }

    if (result.data.type === "error") {
      throw new Error(`Gemini could not analyze ${pkg.name}: ${result.data.message}`);
    }

    return result.data;
  }

  throw new Error(`Failed to get a valid response from Gemini after ${MAX_RETRIES} attempts`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const packages = getPackages();
  const today = new Date().toISOString().slice(0, 10);
  const decisions = new Map<string, ReleaseDecision>();

  if (DRY_RUN) {
    console.log("\n🔍 DRY_RUN — analyzing with Gemini but skipping commit and publish\n");
  }

  // 1. Analyze each package ───────────────────────────────────────────────────
  console.log(`📦 Analyzing ${packages.length} packages...\n`);

  for (const pkg of packages) {
    const lastTag = getLastTag(pkg.name);

    if (!lastTag) {
      // First-ever publish — no diff to analyze, use current version as-is
      console.log(`  ${pkg.name}  NEW  →  ${pkg.version}`);
      decisions.set(pkg.name, {
        pkg,
        bump: "patch",
        newVersion: pkg.version,
        changelogEntry: `## [${pkg.version}] - ${today}\n\n- Initial release.\n`,
        isNew: true,
      });
      continue;
    }

    const relDir = pkg.dir.slice(ROOT.length + 1);
    const diff = getDiff(relDir, lastTag);

    if (!diff.trim()) {
      console.log(`  ${pkg.name}  unchanged  (${pkg.version})`);
      continue;
    }

    process.stdout.write(`  ${pkg.name}  analyzing...  `);
    const analysis = await analyzeWithGemini(pkg, diff);

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
    const label = d.isNew ? "NEW" : d.bump;
    console.log(`  ${d.pkg.name}  ${label}  ${d.pkg.version} → ${d.newVersion}`);
  }

  if (DRY_RUN) {
    console.log("\n(DRY_RUN — stopping here)\n");
    return;
  }

  // 3. Write package.json + CHANGELOG ────────────────────────────────────────
  console.log("\n✍️  Updating versions and changelogs...");
  for (const [, d] of decisions) {
    const updatedJson = { ...d.pkg.json, version: d.newVersion };
    writeFileSync(d.pkg.pkgPath, JSON.stringify(updatedJson, null, 2) + "\n");

    if (d.isNew) {
      writeFileSync(join(d.pkg.dir, "CHANGELOG.md"), `# Changelog\n\n${d.changelogEntry}`);
    } else {
      prependChangelog(d.pkg.dir, d.changelogEntry);
    }
  }

  // 4. Commit + tag + push ────────────────────────────────────────────────────
  const releaseList = [...decisions.values()]
    .map((d) => `${d.pkg.name}@${d.newVersion}`)
    .join(", ");
  console.log("\n📝 Committing...");
  git(`config user.email "github-actions[bot]@users.noreply.github.com"`);
  git(`config user.name "github-actions[bot]"`);
  git(`add -A`);
  git(`commit -m "chore: release ${releaseList} [skip ci]"`);

  for (const [, d] of decisions) {
    const tag = `${d.pkg.name}@${d.newVersion}`;
    git(`tag ${tag}`);
    console.log(`  Tagged: ${tag}`);
  }

  console.log("\n⬆️  Pushing...");
  git(`push origin HEAD:main --follow-tags`, { stdio: "inherit" });

  // 5. Build ──────────────────────────────────────────────────────────────────
  console.log("\n🔨 Building packages...");
  execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });

  // 6. Publish ────────────────────────────────────────────────────────────────
  console.log("\n📤 Publishing to npm...\n");
  for (const [, d] of decisions) {
    console.log(`  ${d.pkg.name}@${d.newVersion}`);
    const provenance = process.env.CI === "true" ? " --provenance" : "";
    execSync(`pnpm publish --no-git-checks --access public${provenance}`, {
      cwd: d.pkg.dir,
      stdio: "inherit",
    });
  }

  console.log("\n✅ Done!\n");
}

main().catch((err: unknown) => {
  console.error("\n❌ Release failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
