import { dirname, join, resolve } from "https://deno.land/std@0.208.0/path/mod.ts";
import { parse as parseToml } from "https://deno.land/std@0.208.0/toml/mod.ts";
import { fileExists } from "./fs.ts";

export interface MetaConfig {
  schema_version?: string;
}

export interface PluginEntry {
  id?: string;
  name?: string;
  path?: string;
  entrypoint?: string;
  schema_version?: string;
}

export interface PageEntry {
  id?: string;
  name?: string;
  path?: string;
  entrypoint?: string;
  schema_version?: string;
  domains?: string[];
  locales?: string[];
}

export interface LoruConfig {
  meta?: MetaConfig;
  plugin?: PluginEntry[];
  page?: PageEntry[];
}

const CONFIG_FILES = ["loru.toml", ".loru/loru.toml"];

export async function findConfig(startDir = Deno.cwd()): Promise<string | undefined> {
  let dir = startDir;
  while (true) {
    for (const cfg of CONFIG_FILES) {
      const candidate = join(dir, cfg);
      if (await fileExists(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export async function loadConfig(path?: string): Promise<{ path?: string; baseDir: string; config?: LoruConfig }> {
  const cfgPath = path ?? (await findConfig());
  const baseDir = cfgPath ? dirname(cfgPath) : Deno.cwd();
  if (!cfgPath) return { baseDir };
  const text = await Deno.readTextFile(cfgPath);
  const parsed = parseToml(text) as LoruConfig;
  return { path: cfgPath, baseDir, config: parsed };
}

export function resolveMetaFile(baseDir: string, entryPath: string | undefined, kind: "plugin" | "tenant"): string {
  const file = kind === "plugin" ? "plugin.toml" : "tenant.toml";
  return entryPath ? resolve(baseDir, entryPath, file) : resolve(baseDir, file);
}
