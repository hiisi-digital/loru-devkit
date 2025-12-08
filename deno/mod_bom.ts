import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import * as semver from "https://deno.land/std@0.208.0/semver/mod.ts";
import { BOM_CACHE_DIR } from "./constants.ts";
import { parse as parseToml } from "https://deno.land/std@0.208.0/toml/mod.ts";

const DEFAULT_CACHE = BOM_CACHE_DIR;
const DEFAULT_REPO = "hiisi-digital/loru-devkit";

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

function authHeaders() {
  const token = Deno.env.get("LORU_GITHUB_TOKEN") ?? Deno.env.get("GITHUB_TOKEN");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function listTags(repo: string): Promise<string[]> {
  const tags: string[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=100&page=${page}`, {
      headers: authHeaders(),
    });
    if (!res.ok) break;
    const data = (await res.json()) as Array<{ name: string }>;
    if (!data.length) break;
    for (const tag of data) tags.push(tag.name);
    page += 1;
  }
  return tags;
}

function parseTags(tags: string[]): semver.SemVer[] {
  return tags
    .map((t) => semver.parse(t))
    .filter((v): v is semver.SemVer => Boolean(v));
}

async function resolveVersion(range: string, repo: string): Promise<string | undefined> {
  const versions = parseTags((await listTags(repo)).map(stripV));
  if (!versions.length) return undefined;
  if (semver.isSemVer(range)) {
    const exact = versions.find((v) => semver.format(v) === range);
    if (exact) return semver.format(exact);
  }
  const parsedRange = semver.parseRange(range);
  if (!parsedRange) return undefined;
  const matches = versions.filter((v) => semver.testRange(v, parsedRange)).sort(semver.compare);
  const latest = matches.at(-1);
  return latest ? semver.format(latest) : undefined;
}

export interface FetchBomOptions {
  version?: string; // semver or range; defaults to latest tag if empty
  repo?: string; // default hiisi-digital/loru-devkit
  cacheDir?: string; // default .loru/cache/boms
}

export async function fetchBom(opts: FetchBomOptions = {}): Promise<string> {
  const repo = opts.repo ?? DEFAULT_REPO;
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE;
  const tags = parseTags((await listTags(repo)).map(stripV));
  const latest = [...tags].sort(semver.compare).at(-1);
  const versionOrRange = opts.version ?? (latest ? semver.format(latest) : "0.1.0");

  const resolved =
    (await resolveVersion(versionOrRange, repo)) ??
    (semver.isSemVer(versionOrRange) ? versionOrRange : undefined) ??
    (latest ? semver.format(latest) : "0.1.0");

  const targetDir = join(cacheDir, resolved);
  await Deno.mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, `bom.json`);
  if (await fileExists(targetPath)) return targetPath;

  const urls = [
    `https://raw.githubusercontent.com/${repo}/v${resolved}/boms/v${resolved}.json`,
    `https://raw.githubusercontent.com/${repo}/main/boms/v${resolved}.json`,
  ];
  for (const url of urls) {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      await Deno.writeTextFile(targetPath, text);
      return targetPath;
    }
  }

  throw new Error(`Failed to fetch BOM ${resolved} from ${repo}`);
}
