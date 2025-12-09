import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import * as semver from "https://deno.land/std@0.208.0/semver/mod.ts";
import { collectWorkspaceConfigs, WorkspaceConfig } from "./workspace.ts";
import { loadEnvFiles } from "./env.ts";
import {
  bumpVersion,
  readCargoVersion,
  setCargoVersion,
  setJsonVersion,
} from "./version.ts";
import { fileExists } from "./fs.ts";

type Level = "patch" | "minor" | "major";
interface BumpOptions {
  fixMissing?: boolean;
}
type ManifestKind = "deno" | "rust";

interface Manifest {
  kind: ManifestKind;
  path: string;
  version: string;
}

interface Entry {
  kind: "plugin" | "page" | "lib";
  id: string;
  name: string;
  baseDir: string;
  path: string;
  manifest?: Manifest;
  publish?: string;
}

interface PendingAction {
  entry: Pick<Entry, "kind" | "id">;
  version: string;
  tag: string;
  changelog: string;
  publish?: string;
  commit: string;
  path: string;
}

const STATE_PATH = ".loru/cache/bump-state.json";

async function run(cmd: string, cwd = Deno.cwd()) {
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

async function capture(cmd: string, cwd = Deno.cwd()): Promise<string> {
  const proc = new Deno.Command(Deno.env.get("SHELL") ?? "sh", {
    args: ["-c", cmd],
    cwd,
    stdin: "null",
    stdout: "piped",
    stderr: "null",
  });
  const { code, stdout } = await proc.output();
  if (code !== 0) return "";
  return new TextDecoder().decode(stdout).trim();
}

function tagPrefix(entry: Entry): string {
  return `loru-${entry.kind}-${entry.id}`;
}

function pathSafeId(id: string): string {
  return id.replaceAll("/", "@").replaceAll("\\", "@");
}

function tagPrefixFs(entry: Entry): string {
  return `loru-${entry.kind}-${pathSafeId(entry.id)}`;
}

function changelogPath(entry: Entry, version: string): string {
  const dir = join(entry.baseDir, ".loru", "changelog");
  const file = join(dir, `${tagPrefixFs(entry)}-v${version}.md`);
  return file;
}

function tagName(entry: Entry, version: string): string {
  return `${tagPrefix(entry)}-v${version}`;
}

async function lastEntryTag(
  entry: Entry,
): Promise<{ tag: string; version: string } | undefined> {
  const prefix = tagPrefix(entry);
  const tagsRaw = await capture(`git tag --list "${prefix}-v*"`);
  const tags = tagsRaw
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const version = t.replace(`${prefix}-v`, "");
      return { tag: t, version: semver.parse(version) };
    })
    .filter((t) => t.version)
    .sort((a, b) => semver.compare(a.version!, b.version!));
  const latest = tags.at(-1);
  return latest
    ? { tag: latest.tag, version: semver.format(latest.version!) }
    : undefined;
}

async function hasChangesSince(
  tag: string | undefined,
  targetPath: string,
): Promise<boolean> {
  if (!tag) return true;
  const proc = new Deno.Command("git", {
    args: ["diff", "--quiet", `${tag}..HEAD`, "--", targetPath],
    stdin: "null",
  });
  const out = await proc.output();
  return out.code !== 0;
}

async function readDenoVersion(path: string): Promise<string | undefined> {
  try {
    const raw = await Deno.readTextFile(path);
    const json = JSON.parse(raw) as { version?: string };
    return typeof json.version === "string" ? json.version : undefined;
  } catch {
    return undefined;
  }
}

async function detectManifest(
  entryPath: string,
): Promise<Manifest | undefined> {
  const denoJson = join(entryPath, "deno.json");
  const denoJsonc = join(entryPath, "deno.jsonc");
  const cargoToml = join(entryPath, "Cargo.toml");

  if (await fileExists(denoJson)) {
    const version = (await readDenoVersion(denoJson)) ?? "0.0.0";
    return { kind: "deno", path: denoJson, version };
  }
  if (await fileExists(denoJsonc)) {
    const version = (await readDenoVersion(denoJsonc)) ?? "0.0.0";
    return { kind: "deno", path: denoJsonc, version };
  }
  if (await fileExists(cargoToml)) {
    const version = (await readCargoVersion(cargoToml)) ?? "0.0.0";
    return { kind: "rust", path: cargoToml, version };
  }
  return undefined;
}

function buildEntryList(configs: WorkspaceConfig[]): Entry[] {
  const entries: Entry[] = [];
  for (const cfg of configs) {
    for (const plugin of cfg.config.plugin ?? []) {
      entries.push({
        kind: "plugin",
        id: plugin.id,
        name: plugin.name,
        baseDir: cfg.baseDir,
        path: join(cfg.baseDir, plugin.path ?? "."),
      });
    }
    for (const page of cfg.config.page ?? []) {
      entries.push({
        kind: "page",
        id: page.id,
        name: page.name,
        baseDir: cfg.baseDir,
        path: join(cfg.baseDir, page.path ?? "."),
      });
    }
    for (const lib of cfg.config.lib ?? []) {
      entries.push({
        kind: "lib",
        id: lib.name,
        name: lib.name,
        baseDir: cfg.baseDir,
        path: join(cfg.baseDir, lib.path),
        publish: lib.publish,
      });
    }
  }
  return entries;
}

async function writeChangelog(
  entry: Entry,
  version: string,
  since?: string,
): Promise<string> {
  const range = since ? `${since}..HEAD` : "HEAD";
  const log = await capture(`git log ${range} --oneline -- "${entry.path}"`);
  const path = changelogPath(entry, version);
  await Deno.mkdir(join(entry.baseDir, ".loru", "changelog"), {
    recursive: true,
  });
  const body = `# ${entry.name} v${version}\n\n${
    log || "No commits recorded."
  }\n`;
  await Deno.writeTextFile(path, body);
  return path;
}

async function createRelease(tag: string, changelog: string) {
  const token = Deno.env.get("LORU_GITHUB_TOKEN") ??
    Deno.env.get("GITHUB_TOKEN");
  if (!token) {
    throw new Error(
      "Missing LORU_GITHUB_TOKEN/GITHUB_TOKEN for GitHub release",
    );
  }
  await run(
    `GITHUB_TOKEN=${token} gh release create ${tag} -F ${
      JSON.stringify(changelog)
    } -t ${tag}`,
  );
}

async function publishLib(entry: Entry) {
  if (!entry.publish) return;
  if (entry.publish === "jsr" && entry.kind === "lib") {
    const token = Deno.env.get("LORU_JSR_TOKEN");
    if (!token) throw new Error("Missing LORU_JSR_TOKEN for jsr publish");
    await run(`DENO_AUTH_TOKENS=${token} deno publish`, entry.path);
  } else if (entry.publish === "crates.io" && entry.kind === "lib") {
    const token = Deno.env.get("LORU_CRATES_IO_TOKEN");
    if (!token) {
      throw new Error("Missing LORU_CRATES_IO_TOKEN for crates.io publish");
    }
    await run(`cargo publish --token ${token}`, entry.path);
  }
}

function loadState(): PendingAction[] {
  try {
    const text = Deno.readTextFileSync(join(Deno.cwd(), STATE_PATH));
    const parsed = JSON.parse(text) as PendingAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveState(pending: PendingAction[]) {
  const statePath = join(Deno.cwd(), STATE_PATH);
  Deno.mkdirSync(join(Deno.cwd(), ".loru", "cache"), { recursive: true });
  Deno.writeTextFileSync(statePath, JSON.stringify(pending, null, 2));
}

async function pushStash(marker = "loru-bump-temp"): Promise<string | null> {
  const before = await capture(`git stash list --format="%gd:%gs"`);
  const beforeSet = new Set(before.split("\n").filter(Boolean));
  await run(`git stash push -u -m ${JSON.stringify(marker)} || true`);
  const after = await capture(`git stash list --format="%gd:%gs"`);
  const added = after
    .split("\n")
    .filter(Boolean)
    .find((l) => !beforeSet.has(l) && l.includes(marker));
  if (!added) return null;
  return added.split(":")[0];
}

async function dropOrPopStash(ref: string, restore: boolean) {
  if (!ref) return;
  const cmd = restore
    ? `git stash pop ${ref} || true`
    : `git stash drop ${ref} || true`;
  await run(cmd);
}

async function resumePending(): Promise<void> {
  const pending = loadState();
  if (!pending.length) return;

  const remaining: PendingAction[] = [];
  for (const item of pending) {
    try {
      await createRelease(item.tag, item.changelog);
      if (item.publish) {
        const fakeEntry: Entry = {
          kind: item.entry.kind,
          id: item.entry.id,
          name: item.entry.id,
          baseDir: item.path,
          path: item.path,
          publish: item.publish,
        };
        await publishLib(fakeEntry);
      }
    } catch (_err) {
      remaining.push(item);
    }
  }

  if (remaining.length) {
    saveState(remaining);
    console.warn(
      `Pending bump actions remain (${remaining.length}); rerun after providing tokens.`,
    );
  } else {
    try {
      Deno.removeSync(join(Deno.cwd(), STATE_PATH));
    } catch {
      // ignore
    }
  }
}

async function updateManifest(manifest: Manifest, next: string) {
  if (manifest.kind === "deno") {
    await setJsonVersion(manifest.path, next);
  } else if (manifest.kind === "rust") {
    await setCargoVersion(manifest.path, next);
  }
}

export async function bumpAndRelease(
  level: Level,
  opts: BumpOptions = {},
): Promise<void> {
  await loadEnvFiles();
  await resumePending();
  let stashRef: string | null = null;
  let success = false;

  try {
    stashRef = await pushStash();

    const configs = await collectWorkspaceConfigs();
    if (!configs.length) throw new Error("No loru.toml found");

    const entries = buildEntryList(configs);
    const missing: Array<{ entry: Entry; manifest: Manifest }> = [];
    const pending: PendingAction[] = [];
    const work: Array<{
      entry: Entry;
      manifest: Manifest;
      next: string;
      changelog: string;
      tag?: string;
    }> = [];

    for (const entry of entries) {
      const manifest = entry.manifest ?? (await detectManifest(entry.path));
      if (!manifest) continue;
      entry.manifest = manifest;

      const last = await lastEntryTag(entry);
      const currentTag = tagName(entry, manifest.version ?? "0.0.0");
      const hasCurrentTag = !!(await capture(`git tag --list "${currentTag}"`));
      if (!hasCurrentTag) missing.push({ entry, manifest });

      const changed = await hasChangesSince(last?.tag, entry.path);
      if (!changed) continue;

      const next = bumpVersion(manifest.version ?? "0.0.0", level);
      await updateManifest(manifest, next);
      const changelog = await writeChangelog(entry, next, last?.tag);
      work.push({ entry, manifest, next, changelog, tag: last?.tag });
    }

    if (missing.length && !opts.fixMissing) {
      const details = missing
        .map((m) =>
          `- ${m.entry.name} (${m.entry.kind}): missing tag ${
            tagName(m.entry, m.manifest.version ?? "0.0.0")
          }`
        )
        .join("\n");
      throw new Error(
        `Missing tags/releases for current versions:\n${details}\n` +
          "Tag manually or rerun with --fix-missing to backfill before bumping.",
      );
    }

    if (missing.length && opts.fixMissing) {
      console.log(
        "Backfilling missing tags/releases for current versions before bumping...",
      );
      for (const m of missing) {
        const last = await lastEntryTag(m.entry);
        const tag = tagName(m.entry, m.manifest.version ?? "0.0.0");
        const changelog = await writeChangelog(
          m.entry,
          m.manifest.version ?? "0.0.0",
          last?.tag,
        );
        try {
          await run(`git tag ${tag}`);
          await run(`git push origin ${tag}`);
          await createRelease(tag, changelog);
          await publishLib(m.entry);
        } catch (_err) {
          pending.push({
            entry: { kind: m.entry.kind, id: m.entry.id },
            version: m.manifest.version ?? "0.0.0",
            tag,
            changelog,
            publish: m.entry.publish,
            commit: await capture("git rev-parse HEAD"),
            path: m.entry.path,
          });
        }
      }
    }

    if (!work.length) {
      console.log("No entries changed since last release.");
      if (stashRef) {
        await dropOrPopStash(stashRef, true);
        stashRef = null;
      }
      success = true;
      return;
    }

    const files = work.flatMap((w) => [w.manifest.path, w.changelog]);
    await run(`git add ${files.map((f) => JSON.stringify(f)).join(" ")}`);
    const message = `chore: release ${
      work.map((w) => `${w.entry.id}@v${w.next}`).join(", ")
    }`;
    await run(`git commit -m ${JSON.stringify(message)}`);

    const tags = work.map((w) => ({
      entry: w.entry,
      tag: tagName(w.entry, w.next),
      changelog: w.changelog,
      version: w.next,
    }));
    for (const t of tags) {
      await run(`git tag ${t.tag}`);
    }

    await run("git push");
    for (const t of tags) {
      await run(`git push origin ${t.tag}`);
    }

    for (const t of tags) {
      try {
        await createRelease(t.tag, t.changelog);
        await publishLib(t.entry);
      } catch (_err) {
        pending.push({
          entry: { kind: t.entry.kind, id: t.entry.id },
          version: t.version,
          tag: t.tag,
          changelog: t.changelog,
          publish: t.entry.publish,
          commit: await capture("git rev-parse HEAD"),
          path: t.entry.path,
        });
      }
    }

    if (pending.length) {
      saveState(pending);
      throw new Error(
        `Some release steps deferred (${pending.length}). Provide tokens and rerun bump.`,
      );
    }
    success = true;
  } finally {
    if (stashRef) {
      await dropOrPopStash(stashRef, !success);
    }
  }
}

export async function resumeReleases(opts: BumpOptions = {}): Promise<void> {
  await loadEnvFiles();
  await resumePending();

  const configs = await collectWorkspaceConfigs();
  if (!configs.length) throw new Error("No loru.toml found");
  const entries = buildEntryList(configs);

  const missing: Array<{ entry: Entry; manifest: Manifest }> = [];
  for (const entry of entries) {
    const manifest = entry.manifest ?? (await detectManifest(entry.path));
    if (!manifest) continue;
    entry.manifest = manifest;
    const tag = tagName(entry, manifest.version ?? "0.0.0");
    const hasTag = !!(await capture(`git tag --list "${tag}"`));
    if (!hasTag) missing.push({ entry, manifest });
  }

  if (missing.length && !opts.fixMissing) {
    const details = missing
      .map((m) =>
        `- ${m.entry.name} (${m.entry.kind}): missing tag ${
          tagName(m.entry, m.manifest.version ?? "0.0.0")
        }`
      )
      .join("\n");
    throw new Error(
      `Missing tags/releases for current versions:\n${details}\n` +
        "Tag manually or rerun with --resume --fix-missing to backfill without bumping.",
    );
  }

  const pending: PendingAction[] = [];

  for (const m of missing) {
    const last = await lastEntryTag(m.entry);
    const version = m.manifest.version ?? "0.0.0";
    const tag = tagName(m.entry, version);
    const changelog = await writeChangelog(m.entry, version, last?.tag);
    try {
      await run(`git tag ${tag}`);
      await run(`git push origin ${tag}`);
      await createRelease(tag, changelog);
      await publishLib(m.entry);
    } catch (_err) {
      pending.push({
        entry: { kind: m.entry.kind, id: m.entry.id },
        version,
        tag,
        changelog,
        publish: m.entry.publish,
        commit: await capture("git rev-parse HEAD"),
        path: m.entry.path,
      });
    }
  }

  if (pending.length) {
    saveState(pending);
    throw new Error(
      `Some release steps deferred (${pending.length}). Provide tokens and rerun --resume.`,
    );
  }
}

// Internal utilities exposed for testing
export const _pathSafeId = pathSafeId;
export const _changelogPath = changelogPath;
export const _writeChangelog = writeChangelog;
