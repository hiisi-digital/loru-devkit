# Loru Devkit

Utilities for Loru tooling and metadata:

- Schema fetcher with semver range resolution and caching
- BOM (bill of materials) fetcher with caching
- Shared helpers for plugins, tenants, and platform tooling

## Using the schema fetcher

```bash
# Fetch plugin metadata schema (resolves schema_version from plugin.toml)
deno run -A https://raw.githubusercontent.com/hiisi-digital/loru-devkit/main/deno/fetch_schema.ts \\
  --schema=plugin-metadata \\
  --meta-file=plugin.toml \\
  --cache-dir=.loru/cache/schemas

# Fetch tenant metadata schema
deno run -A https://raw.githubusercontent.com/hiisi-digital/loru-devkit/main/deno/fetch_schema.ts \\
  --schema=tenant-metadata \\
  --meta-file=tenant.toml \\
  --cache-dir=.loru/cache/schemas
```

Options:
- `--schema`: `plugin-metadata` or `tenant-metadata`
- `--version`: override schema version or semver range (otherwise read from metadata)
- `--meta-file`: TOML file to read `schema_version` from (defaults: `plugin.toml`, `tenant.toml`, `.loru/plugin.toml`, `.loru/tenant.toml`)
- `--cache-dir`: cache location (default `.loru/cache/schemas`)
- `--repo`: schema repo (default `hiisi-digital/loru-schemas`)

The fetcher resolves semver ranges against tags in `loru-schemas`, caches the schema locally, and prints the cached path.

## BOM fetcher

```bash
deno run -A https://raw.githubusercontent.com/hiisi-digital/loru-devkit/main/deno/fetch_bom.ts \
  --version=^0.1.0 \
  --cache-dir=.loru/cache/boms
```

Options:
- `--version`: platform/BOM version or semver range (default: latest tag)
- `--cache-dir`: cache location (default `.loru/cache/boms`)
- `--repo`: devkit repo (default `hiisi-digital/loru-devkit`)

The BOM maps platform release to compatible component ranges (schemas, templates, libs).

## TODO
- Package distribution via GitHub tags (consume raw URLs pinned to tags)
- CI workflows for publishing tagged snapshots
