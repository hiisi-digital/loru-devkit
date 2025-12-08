import { parse as parseToml } from "https://deno.land/std@0.208.0/toml/mod.ts";

export type BumpLevel = "patch" | "minor" | "major";

export function bumpVersion(current: string, level: BumpLevel): string {
  const [maj, min, pat] = current.split(".").map((n) => parseInt(n, 10));
  if ([maj, min, pat].some((n) => Number.isNaN(n))) throw new Error(`Invalid version: ${current}`);
  switch (level) {
    case "patch":
      return `${maj}.${min}.${pat + 1}`;
    case "minor":
      return `${maj}.${min + 1}.0`;
    case "major":
      return `${maj + 1}.0.0`;
  }
}

export async function bumpJsonVersion(file: string, level: BumpLevel): Promise<string> {
  const raw = await Deno.readTextFile(file);
  const json = JSON.parse(raw) as { version?: string };
  const next = bumpVersion(json.version ?? "0.0.0", level);
  json.version = next;
  await Deno.writeTextFile(file, JSON.stringify(json, null, 2) + "\n");
  return next;
}

export async function readCargoVersion(path: string): Promise<string | undefined> {
  try {
    const text = await Deno.readTextFile(path);
    const parsed = parseToml(text) as { package?: { version?: string } };
    const v = parsed?.package?.version;
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

export async function setCargoVersion(path: string, version: string): Promise<void> {
  const text = await Deno.readTextFile(path);
  const parsed = parseToml(text) as any;
  if (!parsed.package) parsed.package = {};
  parsed.package.version = version;
  const out = tomlStringify(parsed);
  await Deno.writeTextFile(path, out);
}

export async function setJsonVersion(file: string, version: string): Promise<void> {
  const raw = await Deno.readTextFile(file);
  const json = JSON.parse(raw) as { version?: string };
  json.version = version;
  await Deno.writeTextFile(file, JSON.stringify(json, null, 2) + "\n");
}

function tomlStringify(obj: Record<string, unknown>): string {
  // minimal TOML writer for package.version updates
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
