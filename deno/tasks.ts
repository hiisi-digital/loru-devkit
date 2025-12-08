import { LoruConfig } from "https://raw.githubusercontent.com/hiisi-digital/loru-schemas/v0.2.1/typescript/mod.ts";

type PlatformKey = "windows" | "darwin" | "linux";

function currentPlatform(): PlatformKey {
  const os = Deno.build.os;
  if (os === "windows") return "windows";
  if (os === "darwin") return "darwin";
  return "linux";
}

export interface ResolvedTask {
  name: string;
  cmd: string;
  cwd: string;
}

export function resolveTasks(cfg: LoruConfig, baseDir: string, name: string): ResolvedTask[] {
  const tasks = cfg.task ?? [];
  const matches = tasks.filter((t) => t.name === name);
  const platform = currentPlatform();
  const resolved: ResolvedTask[] = [];
  for (const t of matches) {
    let cmd = t.cmd;
    const platformCmd = t.platform?.[platform]?.cmd;
    if (platformCmd) cmd = platformCmd;
    if (!cmd) continue;
    resolved.push({ name: t.name!, cmd, cwd: baseDir });
  }
  return resolved;
}
