import { dirname, join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { loadSync } from "std/dotenv/mod.ts";
import { resolveArtifacts } from "./artifacts.ts";
import type { LoruConfig } from "@loru/schemas";

type Tool = "deno" | "cargo" | "generic";

async function collectEnvVars(
  startDir: string,
  stopDir?: string,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  const seen = new Set<string>();
  let dir = startDir;
  while (true) {
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile || !entry.name.startsWith(".env")) continue;
        const envPath = join(dir, entry.name);
        if (seen.has(envPath)) continue;
        try {
          const parsed = loadSync({ envPath, export: false }) as Record<
            string,
            string
          >;
          Object.assign(env, parsed);
        } catch {
          // ignore parse errors
        }
        seen.add(envPath);
      }
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        // Stop walking upward if the current directory doesn't exist.
        break;
      }
      throw err;
    }
    if (stopDir && dir === stopDir) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return env;
}

export interface EnvOptions {
  cfg: LoruConfig;
  workspaceRoot: string;
  projectRoot: string;
  tool?: Tool;
  target?: string;
  startDir?: string;
  extra?: Record<string, string>;
}

/**
 * Resolve environment for a command: loads .env* from project upward to root (no siblings),
 * merges with process env, adds Loru artifact vars, and maps tool-specific dirs.
 */
export async function resolveCommandEnv(
  opts: EnvOptions,
): Promise<Record<string, string>> {
  const base = Deno.env.toObject();
  const loaded = await collectEnvVars(
    opts.startDir ?? opts.projectRoot,
    opts.projectRoot,
  );
  const tool = opts.tool ?? "generic";
  const artifacts = await resolveArtifacts(
    opts.cfg,
    opts.workspaceRoot,
    opts.projectRoot,
    tool,
    opts.target,
  );

  const mapped: Record<string, string> = {
    LORU_WORKSPACE_PATH: opts.workspaceRoot,
    LORU_WORKSPACE_PATH_BUILDS: artifacts.artifactsRoot,
    LORU_WORKSPACE_ARTIFACTS: artifacts.artifactsRoot,
  };
  if (tool === "deno") mapped.DENO_DIR = artifacts.toolDir;
  if (tool === "cargo") mapped.CARGO_TARGET_DIR = artifacts.toolDir;

  return {
    ...base,
    ...loaded,
    ...mapped,
    ...(opts.extra ?? {}),
  };
}

export { collectEnvVars };

export async function loadEnvFiles(
  startDir = Deno.cwd(),
  stopDir?: string,
): Promise<Record<string, string>> {
  const loaded = await collectEnvVars(startDir, stopDir ?? startDir);
  for (const [k, v] of Object.entries(loaded)) {
    Deno.env.set(k, v);
  }
  return loaded;
}
