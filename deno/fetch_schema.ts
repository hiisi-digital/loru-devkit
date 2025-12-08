#!/usr/bin/env -S deno run -A
import { parse } from "https://deno.land/std@0.208.0/flags/mod.ts";
import { fetchSchema } from "./mod_fetch.ts";

const args = parse(Deno.args, {
  string: ["schema", "version", "meta-file", "cache-dir", "repo"],
});

if (!args.schema || (args.schema !== "plugin-metadata" && args.schema !== "tenant-metadata")) {
  console.error("Usage: fetch_schema.ts --schema=plugin-metadata|tenant-metadata [--version=semver|range] [--meta-file=path] [--cache-dir=.loru/cache/schemas] [--repo=owner/repo]");
  Deno.exit(1);
}

const schemaPath = await fetchSchema({
  schema: args.schema,
  version: args.version,
  metaFile: args["meta-file"],
  cacheDir: args["cache-dir"],
  repo: args.repo,
});

console.log(schemaPath);
