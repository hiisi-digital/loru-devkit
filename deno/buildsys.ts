import { join, relative } from "https://deno.land/std@0.208.0/path/mod.ts";
import { parse as parseToml } from "https://deno.land/std@0.208.0/toml/mod.ts";
import { collectWorkspaceConfigs } from "./workspace.ts";
import { fileExists } from "./fs.ts";
import { writeUserConfig } from "./user_config.ts";

function writeJson(path: string, data: unknown) {
  return Deno.writeTextFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

function parseJsonc(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const stripped = text.replace(/\/\*.*?\*\/|\/\/.*(?=[\n\r])/gs, "");
    return JSON.parse(stripped) as Record<string, unknown>;
  }
}

function stringifyToml(obj: Record<string, unknown>): string {
  let out = "";
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "object" && v && !Array.isArray(v)) {
      out += `[${k}]\n`;
      for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) {
        out += `${ck} = "${cv}"\n`;
      }
    } else {
      out += `${k} = "${v}"\n`;
    }
  }
  return out;
}

async function updateDenoConfig(projectDir: string, root: string) {
  const candidates = ["deno.json", "deno.jsonc"];
  for (const file of candidates) {
    const full = join(projectDir, file);
    if (!(await fileExists(full))) continue;
    const text = await Deno.readTextFile(full);
    const parsed = parseJsonc(text);
    const lockPath = parsed.lock as { path?: string } | undefined;
    const desired = relative(projectDir, join(root, ".loru", "deno.lock"));
    if (!lockPath || lockPath.path !== desired) {
      parsed.lock = { path: desired };
      await writeJson(full, parsed);
    }
  }
}

async function updateCargoConfig(projectDir: string, root: string) {
  const cargoPath = join(projectDir, "Cargo.toml");
  if (!(await fileExists(cargoPath))) return;
  // No longer mutating Cargo.toml for target-dir; rely on env (CARGO_TARGET_DIR) when running commands.
}

export async function initBuildSystem(startDir = Deno.cwd()) {
  const configs = await collectWorkspaceConfigs(startDir);
  if (!configs.length) throw new Error("No loru.toml found");
  const root = configs[0].baseDir;

  const defaultArtifacts = (() => {
    const stateHome = Deno.env.get("XDG_STATE_HOME") ?? join(Deno.env.get("HOME") ?? ".", ".local", "state");
    return join(stateHome, "loru", "artifacts");
  })();
  await writeUserConfig({ artifacts_path: defaultArtifacts });

  for (const cfg of configs) {
    const candidateDirs = new Set<string>();
    candidateDirs.add(cfg.baseDir);
    for (const lib of cfg.config.lib ?? []) candidateDirs.add(join(cfg.baseDir, lib.path));
    for (const plugin of cfg.config.plugin ?? []) candidateDirs.add(join(cfg.baseDir, plugin.path ?? "."));
    for (const page of cfg.config.page ?? []) candidateDirs.add(join(cfg.baseDir, page.path ?? "."));

    for (const dir of candidateDirs) {
      await updateDenoConfig(dir, root);
      await updateCargoConfig(dir, root);
    }
  }
}
