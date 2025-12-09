import { isAbsolute, join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { LoruConfig } from "@loru/schemas";
import { readUserConfig } from "./user_config.ts";

type Tool = "deno" | "cargo" | "generic";

interface ArtifactsCfg {
  scope?: "workspace" | "project" | "custom";
  path?: string;
  dirname?: string;
}

function pickArtifacts(cfg: LoruConfig): ArtifactsCfg {
  return cfg.check?.artifacts ?? cfg.build?.artifacts ?? {};
}

async function basePath(cfg: LoruConfig, workspaceRoot: string, projectRoot: string): Promise<string> {
  const envRoot = Deno.env.get("LORU_WORKSPACE_PATH_BUILDS") ?? Deno.env.get("LORU_WORKSPACE_ARTIFACTS");
  if (envRoot) return envRoot;

  const artifacts = pickArtifacts(cfg);
  const scope = artifacts.scope ?? "workspace";
  if (scope === "custom" && artifacts.path) {
    return isAbsolute(artifacts.path) ? artifacts.path : join(projectRoot, artifacts.path);
  }
  if (scope === "project") return join(projectRoot, ".loru/artifacts");

  const userConfig = await readUserConfig();
  const userArtifacts = typeof userConfig?.artifacts_path === "string" ? userConfig.artifacts_path : undefined;
  if (userArtifacts) return userArtifacts;

  return join(workspaceRoot, ".loru/artifacts");
}

function applyTemplate(dirname: string, tool: Tool, target?: string): string {
  const withTool = dirname.replaceAll("@tool", tool);
  const targetToken = target ? `${tool}-${target}` : tool;
  return withTool.replaceAll("@tool-target", targetToken);
}

export async function resolveArtifacts(
  cfg: LoruConfig,
  workspaceRoot: string,
  projectRoot: string,
  tool: Tool,
  target?: string,
): { workspaceRoot: string; artifactsRoot: string; toolDir: string } {
  const artifacts = pickArtifacts(cfg);
  const root = await basePath(cfg, workspaceRoot, projectRoot);
  const dirname = applyTemplate(artifacts.dirname ?? "builds/@tool", tool, target);
  return { workspaceRoot, artifactsRoot: root, toolDir: join(root, dirname) };
}
