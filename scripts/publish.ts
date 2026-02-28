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
 * Required env vars:
 *   CF_AI_GATEWAY_URL    Cloudflare AI Gateway base URL
 *                        e.g. https://gateway.ai.cloudflare.com/v1/acct/gw
 *   CF_AI_GATEWAY_TOKEN  Bearer token (cf-aig-authorization)
 *   NODE_AUTH_TOKEN      npm publish token
 *
 * Optional:
 *   DRY_RUN=1  Run the full AI analysis and print the release plan,
 *              but skip writing files, committing, and publishing.
 *   MODEL      Gemini model to use (default: gemini-2.0-flash)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Load .env.local for local development (ignored by git, never present in CI)
if (existsSync(join(process.cwd(), ".env.local"))) {
  process.loadEnvFile(".env.local");
}

// ── types ────────────────────────────────────────────────────────────────────

type BumpType = "major" | "minor" | "patch" | "none";

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

interface GeminiAnalysis {
  bump: BumpType;
  summary: string;
  details: string[];
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

async function analyzeWithGemini(pkg: Pkg, diff: string): Promise<GeminiAnalysis> {
  const gatewayUrl = requireEnv("CF_AI_GATEWAY_URL");
  const gatewayToken = requireEnv("CF_AI_GATEWAY_TOKEN");

  const endpoint =
    `${gatewayUrl.replace(/\/$/, "")}/google-ai-studio/v1beta/models/${MODEL}:generateContent`;

  const prompt = `
You are a semantic versioning expert analyzing a git diff for an npm package.

Package: ${pkg.name}
Current version: ${pkg.version}

Git diff since last release:
\`\`\`diff
${diff.slice(0, 30_000)}
\`\`\`

Determine the appropriate semantic version bump. Respond with valid JSON only, no markdown:
{
  "bump": "major" | "minor" | "patch" | "none",
  "summary": "One-line summary of the changes (past tense)",
  "details": ["Specific change", "Another change"]
}

Rules:
- "major": Breaking API changes — removed/renamed exports, changed signatures
- "minor": New features, new exports, backward-compatible API additions
- "patch": Bug fixes, perf improvements, internal refactoring with no API change
- "none": Only test files, README, CI config, or whitespace — no runtime change

Only src/ changes matter for the bump type.
`.trim();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-aig-authorization": `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  const text = data.candidates[0]?.content.parts[0]?.text ?? "{}";
  const result = JSON.parse(text) as GeminiAnalysis;

  if (!["major", "minor", "patch", "none"].includes(result.bump)) {
    throw new Error(`Unexpected bump value from Gemini: ${JSON.stringify(result)}`);
  }

  return result;
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
    execSync("pnpm publish --no-git-checks --access public", {
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
