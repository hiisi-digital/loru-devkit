# Loru Devkit

Utilities for Loru tooling and metadata:

- Schema fetcher with semver range resolution and caching (`loru-config`)
- BOM (bill of materials) fetcher with caching
- Shared helpers for plugins, pages, libs, and platform tooling (workspace-aware)
- Bump/release pipeline used by `loru dev bump`

## Using the schema fetcher

```bash
# Fetch loru-config schema (reads schema_version from loru.toml)
deno run -A https://raw.githubusercontent.com/hiisi-digital/loru-devkit/v0.3.4/deno/fetch_schema.ts \
  --schema=loru-config \
  --meta-file=loru.toml \
  --cache-dir=.loru/cache/schemas
```

Options:
- `--schema`: `loru-config`
- `--version`: override schema version or semver range (otherwise read from `loru.toml`)
- `--meta-file`: TOML file to read `schema_version` from (defaults: workspace traversal for `loru.toml`)
- `--cache-dir`: cache location (default `.loru/cache/schemas`)
- `--repo`: schema repo (default `hiisi-digital/loru-schemas`)

The fetcher resolves semver ranges against tags in `loru-schemas`, caches the schema locally, and prints the cached path.

## BOM fetcher

```bash
deno run -A https://raw.githubusercontent.com/hiisi-digital/loru-devkit/v0.3.4/deno/fetch_bom.ts \
  --version=^0.1.0 \
  --cache-dir=.loru/cache/boms
```

Options:
- `--version`: platform/BOM version or semver range (default: latest tag)
- `--cache-dir`: cache location (default `.loru/cache/boms`)
- `--repo`: devkit repo (default `hiisi-digital/loru-devkit`)

The BOM maps platform release to compatible component ranges (schemas, templates, libs).

## CLI and tasks

- `loru dev init buildsys` centralizes lock/cargo target paths under `.loru`.
- `loru dev init githooks` installs conventional commit + pre-push hooks across workspaces.
- `loru dev bump` performs per-entry bump, tag, release, and publish (uses `@loru/devkit` release helpers).

Workspace tasks live in `loru.toml`; run them via `loru run <task>`.
