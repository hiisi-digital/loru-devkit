import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { parse as parseToml } from "https://deno.land/std@0.208.0/toml/mod.ts";

export type ProjectKind = "deno" | "rust" | "unknown";

export interface ProjectInfo {
  path: string;
  kind: ProjectKind;
  version?: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function detectProject(path: string): Promise<ProjectInfo> {
  const denoJson = join(path, "deno.json");
  const denoJsonc = join(path, "deno.jsonc");
  const cargoToml = join(path, "Cargo.toml");

  if (await fileExists(denoJson) || await fileExists(denoJsonc)) {
    return { path, kind: "deno", version: await readDenoVersion(denoJsonc, denoJson) };
  }
  if (await fileExists(cargoToml)) {
    return { path, kind: "rust", version: await readCargoVersion(cargoToml) };
  }
  return { path, kind: "unknown" };
}

async function readDenoVersion(...candidates: string[]): Promise<string | undefined> {
  for (const file of candidates) {
    if (await fileExists(file)) {
      try {
        const text = await Deno.readTextFile(file);
        const json = JSON.parse(text) as { version?: string };
        if (typeof json.version === "string") return json.version;
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

async function readCargoVersion(path: string): Promise<string | undefined> {
  try {
    const text = await Deno.readTextFile(path);
    const parsed = parseToml(text) as { package?: { version?: string } };
    const v = parsed?.package?.version;
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}
