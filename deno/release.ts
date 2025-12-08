import { dirname, join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { collectWorkspaceConfigs } from "./workspace.ts";
import { loadEnvFiles } from "./env.ts";
import { bumpVersion, setJsonVersion, readCargoVersion, setCargoVersion } from "./version.ts";
import { fileExists } from "./fs.ts";
import { SCHEMA_CACHE_DIR } from "./constants.ts";

type Level = "patch" | "minor" | "major";

interface Manifest {
  kind: "deno" | "rust";
  path: string;
  version?: string;
}

async function run(cmd: string, cwd: string) {
  const proc = new Deno.Command(Deno.env.get("SHELL") ?? "sh", {
    args: ["-c", cmd],
    cwd,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await proc.output();
  if (code !== 0) throw new Error(`Command failed: ${cmd} (cwd=${cwd})`);
}

async function readDenoVersion(path: string): Promise<string | undefined> {
  if (!(await fileExists(path))) return undefined;
  try {
    const raw = await Deno.readTextFile(path);
    const json = JSON.parse(raw) as { version?: string };
    return json.version;
  } catch {
    return undefined;
  }
}

async function gatherManifests(baseDir: string): Promise<Manifest[]> {
  const manifests: Manifest[] = [];
  const denoPath = join(baseDir, "deno.json");
  const denoJsonc = join(baseDir, "deno.jsonc");
  if (await fileExists(denoPath)) manifests.push({ kind: "deno", path: denoPath, version: await readDenoVersion(denoPath) });
  else if (await fileExists(denoJsonc)) manifests.push({ kind: "deno", path: denoJsonc, version: await readDenoVersion(denoJsonc) });

  const cargoPath = join(baseDir, "Cargo.toml");
  if (await fileExists(cargoPath)) manifests.push({ kind: "rust", path: cargoPath, version: await readCargoVersion(cargoPath) });

  return manifests;
}

async function lastTag(): Promise<string | undefined> {
  const proc = new Deno.Command("git", { args: ["describe", "--tags", "--abbrev=0"], stdin: "null", stdout: "piped", stderr: "null" });
  const out = await proc.output();
  if (out.code !== 0) return undefined;
  return new TextDecoder().decode(out.stdout).trim();
}

async function hasChangesSince(tag: string | undefined, path: string): Promise<boolean> {
  if (!tag) return true;
  const proc = new Deno.Command("git", { args: ["diff", "--quiet", `${tag}..HEAD`, "--", path], stdin: "null" });
  const out = await proc.output();
  return out.code !== 0;
}

async function writeChangelog(version: string): Promise<string> {
  const tag = await lastTag();
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const proc = new Deno.Command("git", { args: ["log", range, "--oneline"], stdout: "piped" });
  const out = await proc.output();
  const log = new TextDecoder().decode(out.stdout);
  const dir = join(".loru", "changelog");
  await Deno.mkdir(dir, { recursive: true });
  const path = join(dir, `${version}.md`);
  const body = `# Changelog ${version}\n\n${log}\n`;
  await Deno.writeTextFile(path, body);
  return path;
}

async function createRelease(version: string, changelogPath: string) {
  const token = Deno.env.get("LORU_GITHUB_TOKEN") ?? Deno.env.get("GITHUB_TOKEN");
  if (!token) {
    throw new Error("Missing LORU_GITHUB_TOKEN/GITHUB_TOKEN for GitHub release");
  }
  await run(`GITHUB_TOKEN=${token} gh release create v${version} -F ${changelogPath} -t v${version}`, Deno.cwd());
}

async function publishLibs(version: string, baseDir: string) {
  const cfgs = await collectWorkspaceConfigs(baseDir);
  for (const cfg of cfgs) {
    for (const lib of cfg.config.lib ?? []) {
      if (!lib.publish) continue;
      const libPath = join(cfg.baseDir, lib.path);
      if (lib.publish === "jsr" && lib.kind === "deno") {
        const token = Deno.env.get("LORU_JSR_TOKEN");
        if (!token) throw new Error("Missing LORU_JSR_TOKEN for jsr publish");
        await run(`DENO_AUTH_TOKENS=${token} deno publish`, libPath);
      } else if (lib.publish === "crates.io" && lib.kind === "rust") {
        const token = Deno.env.get("LORU_CRATES_IO_TOKEN");
        if (!token) throw new Error("Missing LORU_CRATES_IO_TOKEN for crates.io publish");
        await run(`cargo publish --token ${token}`, libPath);
      }
    }
  }
}

export async function bumpAndRelease(level: Level): Promise<void> {
  loadEnvFiles();
  await run("git stash push -u -m loru-bump-temp", Deno.cwd());

  const configs = await collectWorkspaceConfigs();
  if (!configs.length) throw new Error("No loru.toml found");

  const tag = await lastTag();
  const manifests = await gatherManifests(Deno.cwd());
  if (!manifests.length) throw new Error("No manifests found to bump");

  const changed = await hasChangesSince(tag, ".");
  if (!changed) {
    console.log("No changes since last tag; nothing to bump.");
    await run("git stash pop || true", Deno.cwd());
    return;
  }

  const current = manifests.find((m) => m.version)?.version ?? "0.0.0";
  const next = bumpVersion(current, level);

  for (const m of manifests) {
    if (m.kind === "deno") await setJsonVersion(m.path, next);
    if (m.kind === "rust") await setCargoVersion(m.path, next);
  }

  const changelog = await writeChangelog(next);
  await run(`git add ${manifests.map((m) => m.path).join(" ")} ${changelog}`, Deno.cwd());
  await run(`git commit -m \"chore: release v${next}\"`, Deno.cwd());
  await run(`git tag v${next}`, Deno.cwd());
  await run("git push", Deno.cwd());
  await run(`git push origin v${next}`, Deno.cwd());

  await createRelease(next, changelog);
  await publishLibs(next, Deno.cwd());

  await run("git stash pop || true", Deno.cwd());
}
