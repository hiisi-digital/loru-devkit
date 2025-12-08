import { dirname, join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { parse as parseToml } from "https://deno.land/std@0.208.0/toml/mod.ts";
import * as semver from "https://deno.land/std@0.208.0/semver/mod.ts";
import { CONFIG_FILES, SCHEMA_CACHE_DIR } from "./constants.ts";

export type SchemaKind = "loru-config";

export interface FetchOptions {
  schema: SchemaKind;
  version?: string; // semver or range; if omitted, read from meta
  metaFile?: string; // optional path to metadata
  cacheDir?: string; // default .loru/cache/schemas
  repo?: string; // default hiisi-digital/loru-schemas
}

const DEFAULT_VERSION = "0.3.0";
const DEFAULT_CACHE = SCHEMA_CACHE_DIR;
const DEFAULT_REPO = "hiisi-digital/loru-schemas";

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

function stripV(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

async function readSchemaVersion(metaPath?: string): Promise<string | undefined> {
  if (!metaPath) return undefined;
  try {
    const text = await Deno.readTextFile(metaPath);
    const parsed = parseToml(text) as Record<string, unknown>;
    const direct = parsed["schema_version"];
    if (typeof direct === "string") return direct;
    const meta = parsed["meta"];
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const nested = (meta as Record<string, unknown>)["schema_version"];
      if (typeof nested === "string") return nested;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function discoverMetaFile(startDir = Deno.cwd()): Promise<string | undefined> {
  let dir = startDir;
  while (true) {
    for (const candidate of CONFIG_FILES) {
      const p = join(dir, candidate);
      if (await fileExists(p)) return p;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

async function listTags(repo: string): Promise<string[]> {
  const tags: string[] = [];
  let page = 1;
  const token = Deno.env.get("LORU_GITHUB_TOKEN") ?? Deno.env.get("GITHUB_TOKEN") ?? Deno.env.get("GH_TOKEN");

  while (true) {
    const res = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=100&page=${page}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) break;
    const data = (await res.json()) as Array<{ name: string }>;
    if (!data.length) break;
    for (const tag of data) tags.push(tag.name);
    page += 1;
  }
  return tags;
}

async function resolveVersion(range: string, repo: string): Promise<string | undefined> {
  // exact version shortcut
  if (!semver.isSemVer(range) && !semver.parseRange(range)) return undefined;
  const versions = (await listTags(repo))
    .map(stripV)
    .map((t) => semver.parse(t))
    .filter((v): v is semver.SemVer => Boolean(v));
  if (!versions.length) return undefined;

  if (semver.isSemVer(range)) {
    const exact = versions.find((v) => semver.format(v) === range);
    if (exact) return semver.format(exact);
  }

  const parsed = semver.parseRange(range);
  if (!parsed) return undefined;
  const matches = versions.filter((v) => semver.testRange(v, parsed)).sort(semver.compare);
  const latest = matches.at(-1);
  return latest ? semver.format(latest) : undefined;
}

function authHeaders() {
  const token = Deno.env.get("LORU_GITHUB_TOKEN") ?? Deno.env.get("GITHUB_TOKEN");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function fetchSchemaFile(repo: string, version: string, schema: SchemaKind): Promise<string> {
  const urls = [
    `https://raw.githubusercontent.com/${repo}/v${version}/definitions/${schema}.json`,
    `https://raw.githubusercontent.com/${repo}/main/definitions/${schema}.json`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.ok) return await res.text();
  }
  throw new Error(`Failed to fetch schema ${schema} (version ${version}) from ${repo}`);
}

export async function fetchSchema(opts: FetchOptions): Promise<string> {
  const repo = opts.repo ?? DEFAULT_REPO;
  const metaPath = opts.metaFile ?? (await discoverMetaFile());
  const versionOrRange = opts.version ?? (await readSchemaVersion(metaPath)) ?? DEFAULT_VERSION;
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE;
  const resolvedVersion =
    (await resolveVersion(versionOrRange, repo)) ??
    (semver.isSemVer(versionOrRange) ? versionOrRange : undefined) ??
    DEFAULT_VERSION;

  const targetDir = join(cacheDir, resolvedVersion);
  await Deno.mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, `${opts.schema}.json`);
  if (await fileExists(targetPath)) return targetPath;

  const content = await fetchSchemaFile(repo, resolvedVersion, opts.schema);
  await Deno.writeTextFile(targetPath, content);
  return targetPath;
}
