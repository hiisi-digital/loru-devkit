# ============================================================================
# LORU DEVKIT - Task Automation
# ============================================================================

default:
    @just --list

check:
    deno fmt --check
    deno lint

fmt:
    deno fmt

lint:
    deno lint

fetch-schema schema="plugin-metadata" version="" meta-file="" cache-dir=".loru/cache/schemas":
    deno run -A deno/fetch_schema.ts --schema={{schema}} {{?version}}--version={{version}}{{?}} {{?meta_file}}--meta-file={{meta_file}}{{?}} --cache-dir={{cache_dir}}

fetch-bom version="" cache-dir=".loru/cache/boms":
    deno run -A deno/fetch_bom.ts {{?version}}--version={{version}}{{?}} --cache-dir={{cache_dir}}
