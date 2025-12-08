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
