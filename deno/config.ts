import { dirname, join, resolve } from "https://deno.land/std@0.208.0/path/mod.ts";
import { parse as parseToml } from "https://deno.land/std@0.208.0/toml/mod.ts";
import { fileExists } from "./fs.ts";
import { CONFIG_FILES } from "./constants.ts";
import { LoruConfig } from "https://raw.githubusercontent.com/hiisi-digital/loru-schemas/v0.2.0/typescript/mod.ts";

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

export async function loadConfig(path?: string, startDir = Deno.cwd()): Promise<{ path?: string; baseDir: string; config?: LoruConfig }> {
  const cfgPath = path ?? (await findConfig(startDir));
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
