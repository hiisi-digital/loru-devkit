#!/usr/bin/env -S deno run -A
import { parse } from "https://deno.land/std@0.208.0/flags/mod.ts";
import { fetchBom } from "./mod_bom.ts";

const args = parse(Deno.args, {
  string: ["version", "cache-dir", "repo"],
});

const path = await fetchBom({
  version: args.version,
  cacheDir: args["cache-dir"],
  repo: args.repo,
});

console.log(path);
