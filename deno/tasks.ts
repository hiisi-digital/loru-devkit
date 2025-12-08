import { LoruConfig, LoruConfigTaskItem, LoruConfigBuildItem } from "@loru/schemas";

type PlatformKey = "windows" | "darwin" | "linux" | "win";

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

export interface ResolvedBuildTask extends ResolvedTask {
  phase: string;
  targets?: string[];
}

function selectCmd(
  task: { cmd?: string; platform?: Record<string, unknown> },
  platform: PlatformKey,
): string | undefined {
  const override = task.platform?.[platform];
  if (override && typeof override === "object" && !Array.isArray(override)) {
    const cmd = (override as Record<string, unknown>).cmd;
    if (typeof cmd === "string") return cmd;
  }
  return task.cmd;
}

export function resolveTasks(cfg: LoruConfig, baseDir: string, name: string): ResolvedTask[] {
  const tasks = (cfg.task ?? []) as LoruConfigTaskItem[];
  const platform = currentPlatform();
  const matches = tasks.filter((t) => t.name === name);
  const resolved: ResolvedTask[] = [];
  for (const task of matches) {
    const cmd = selectCmd(task, platform);
    if (!cmd) continue;
    resolved.push({ name: task.name, cmd, cwd: baseDir });
  }
  return resolved;
}

export function resolveBuildTasks(
  cfg: LoruConfig,
  baseDir: string,
  phase: string,
  target?: string,
  targetPath?: string,
): ResolvedBuildTask[] {
  const build = (cfg.build ?? []) as LoruConfigBuildItem[];
  const platform = currentPlatform();
  const resolved: ResolvedBuildTask[] = [];
  for (const task of build) {
    if (task.phase !== phase) continue;
    if (task.targets && target && !task.targets.includes(target)) continue;
    const cmd = selectCmd(task, platform);
    if (!cmd) continue;
    resolved.push({
      name: task.name ?? task.phase,
      cmd,
      cwd: targetPath ?? baseDir,
      phase: task.phase,
      targets: task.targets,
    });
  }
  return resolved;
}
