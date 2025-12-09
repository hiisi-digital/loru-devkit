import { dirname, join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/ensure_dir.ts";

function userConfigPath(): string {
  const configHome = Deno.env.get("XDG_CONFIG_HOME") ?? join(Deno.env.get("HOME") ?? ".", ".config");
  return join(configHome, "loru", "config.json");
}

export async function readUserConfig(): Promise<Record<string, unknown> | undefined> {
  try {
    const text = await Deno.readTextFile(userConfigPath());
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export async function writeUserConfig(update: Record<string, unknown>): Promise<void> {
  const path = userConfigPath();
  await ensureDir(dirname(path));
  const existing = (await readUserConfig()) ?? {};
  const next = { ...existing, ...update };
  await Deno.writeTextFile(path, `${JSON.stringify(next, null, 2)}\n`);
}

export { userConfigPath };
