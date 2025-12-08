import { configSync } from "std/dotenv/mod.ts";
import { dirname, join } from "https://deno.land/std@0.208.0/path/mod.ts";

export function loadEnvFiles(startDir = Deno.cwd()): void {
  const visited = new Set<string>();
  let dir = startDir;
  while (true) {
    const envPath = join(dir, ".env");
    if (!visited.has(envPath)) {
      try {
        configSync({ path: envPath, export: true });
      } catch {
        // ignore missing/parse errors
      }
      visited.add(envPath);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
