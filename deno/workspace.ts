import { resolve } from "https://deno.land/std@0.208.0/path/mod.ts";
import { loadConfig } from "./config.ts";
import { LoruConfig } from "@loru/schemas";

export interface WorkspaceConfig {
  path: string;
  baseDir: string;
  config: LoruConfig;
}

async function collectNested(
  configs: WorkspaceConfig[],
  seen: Set<string>,
  baseDir: string,
  config: LoruConfig,
) {
  for (const member of config.workspace?.members ?? []) {
    const abs = resolve(baseDir, member);
    const loaded = await loadConfig(undefined, abs);
    if (!loaded.path || !loaded.config) continue;
    if (seen.has(loaded.path)) continue;
    seen.add(loaded.path);
    configs.push({
      path: loaded.path,
      baseDir: loaded.baseDir,
      config: loaded.config,
    });
    await collectNested(configs, seen, loaded.baseDir, loaded.config);
  }
}

export async function collectWorkspaceConfigs(
  startDir = Deno.cwd(),
): Promise<WorkspaceConfig[]> {
  const primary = await loadConfig(undefined, startDir);
  if (!primary.path || !primary.config) return [];

  const configs: WorkspaceConfig[] = [{
    path: primary.path,
    baseDir: primary.baseDir,
    config: primary.config,
  }];
  const seen = new Set<string>([primary.path]);
  await collectNested(configs, seen, primary.baseDir, primary.config);
  return configs;
}
