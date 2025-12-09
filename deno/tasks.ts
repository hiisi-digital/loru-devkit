import {
  LoruConfig,
  LoruConfigBuild,
  LoruConfigBuildTaskItem,
  LoruConfigCheck,
  LoruConfigCheckTaskItem,
  LoruConfigTaskItem,
} from "@loru/schemas";

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
  phase: LoruConfigBuildTaskItem["phase"];
  targets?: string[];
}

export interface ResolvedCheckTask extends ResolvedTask {
  stage: LoruConfigCheckTaskItem["stage"];
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

export function resolveTasks(
  cfg: LoruConfig,
  baseDir: string,
  name: string,
): ResolvedTask[] {
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
  phase: LoruConfigBuildTaskItem["phase"],
  target?: string,
  targetPath?: string,
): ResolvedBuildTask[] {
  const build = (cfg.build as LoruConfigBuild | undefined)?.task ?? [];
  const platform = currentPlatform();
  const resolved: ResolvedBuildTask[] = [];
  for (const task of build) {
    if (task.phase !== phase) continue;
    if (task.targets?.length) {
      if (!target) continue;
      if (!task.targets.includes(target)) continue;
    }
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

export function resolveCheckTasks(
  cfg: LoruConfig,
  baseDir: string,
  stage: LoruConfigCheckTaskItem["stage"],
  target?: string,
  targetPath?: string,
): ResolvedCheckTask[] {
  const checks = (cfg.check as LoruConfigCheck | undefined)?.task ?? [];
  const platform = currentPlatform();
  const resolved: ResolvedCheckTask[] = [];
  for (const task of checks) {
    if (task.stage !== stage) continue;
    if (task.targets?.length) {
      if (!target) continue;
      if (!task.targets.includes(target)) continue;
    }
    const cmd = selectCmd(task, platform);
    if (!cmd) continue;
    resolved.push({
      name: task.name ?? task.stage,
      cmd,
      cwd: targetPath ?? baseDir,
      stage: task.stage,
      targets: task.targets,
    });
  }
  return resolved;
}
