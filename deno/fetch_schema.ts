#!/usr/bin/env -S deno run -A
import { parse } from "https://deno.land/std@0.208.0/flags/mod.ts";
import { fetchSchema } from "./mod_fetch.ts";

const args = parse(Deno.args, {
  string: ["schema", "version", "meta-file", "cache-dir", "repo"],
});

const schema = (args.schema as string | undefined) ?? "loru-config";

const schemaPath = await fetchSchema({
  schema,
  version: args.version,
  metaFile: args["meta-file"],
  cacheDir: args["cache-dir"],
  repo: args.repo,
});

console.log(schemaPath);
