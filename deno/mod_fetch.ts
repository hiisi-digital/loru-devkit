import { dirname, join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { parse as parseToml } from "https://deno.land/std@0.208.0/toml/mod.ts";
import * as semver from "https://deno.land/std@0.208.0/semver/mod.ts";
import { SCHEMA_CACHE_DIR } from "./constants.ts";

export type SchemaKind = "plugin-metadata" | "tenant-metadata";

export interface FetchOptions {
  schema: SchemaKind;
  version?: string; // semver or range; if omitted, read from meta
  metaFile?: string; // optional path to metadata
  cacheDir?: string; // default .loru/cache/schemas
  repo?: string; // default hiisi-digital/loru-schemas
}

const DEFAULT_VERSION = "0.1.0";
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
    const version = parsed["schema_version"];
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

async function discoverMetaFile(): Promise<string | undefined> {
  const candidates = ["plugin.toml", "tenant.toml", ".loru/plugin.toml", ".loru/tenant.toml"];
  for (const path of candidates) {
    if (await fileExists(path)) return path;
  }
  return undefined;
}

async function listTags(repo: string): Promise<string[]> {
  const tags: string[] = [];
  let page = 1;
  const token = Deno.env.get("GITHUB_TOKEN") ?? Deno.env.get("GH_TOKEN");

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
  const tags = (await listTags(repo)).map(stripV).filter(semver.isSemVer);
  if (!tags.length) return undefined;

  if (semver.isSemVer(range) && tags.includes(range)) return range;

  const parsedRange = semver.parseRange(range);
  if (!parsedRange) return undefined;

  const matches = tags.filter((t) => parsedRange(semver.parse(t)!)).sort(semver.compare);
  return matches.at(-1); // highest matching
}

async function fetchSchemaFile(repo: string, version: string, schema: SchemaKind): Promise<string> {
  const urls = [
    `https://raw.githubusercontent.com/${repo}/v${version}/definitions/${schema}.json`,
    `https://raw.githubusercontent.com/${repo}/main/definitions/${schema}.json`,
  ];
  for (const url of urls) {
    const res = await fetch(url);
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
