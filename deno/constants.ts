import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

const cacheBase = (() => {
  const base = Deno.env.get("LORU_CACHE_DIR") ?? Deno.dir("cache") ?? ".loru/cache";
  return join(base, "loru");
})();

export const CONFIG_FILES = ["loru.toml", ".loru/loru.toml"];
export const SCHEMA_CACHE_DIR = join(cacheBase, "schemas");
export const BOM_CACHE_DIR = join(cacheBase, "boms");
