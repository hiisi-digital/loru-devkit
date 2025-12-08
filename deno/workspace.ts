import { dirname, resolve } from "https://deno.land/std@0.208.0/path/mod.ts";
import { loadConfig } from "./config.ts";

export interface WorkspaceConfig {
  path: string;
  baseDir: string;
  config: import("https://raw.githubusercontent.com/hiisi-digital/loru-schemas/v0.2.1/typescript/mod.ts").LoruConfig;
}

export async function collectWorkspaceConfigs(startDir = Deno.cwd()): Promise<WorkspaceConfig[]> {
  const primary = await loadConfig(undefined, startDir);
  if (!primary.path || !primary.config) return [];
  const configs: WorkspaceConfig[] = [{ path: primary.path, baseDir: primary.baseDir, config: primary.config }];

  for (const member of primary.config.workspace?.members ?? []) {
    const memberCfg = await loadConfig(undefined, resolve(primary.baseDir, member));
    if (memberCfg.path && memberCfg.config) {
      configs.push({ path: memberCfg.path, baseDir: memberCfg.baseDir, config: memberCfg.config });
    }
  }
  return configs;
}
