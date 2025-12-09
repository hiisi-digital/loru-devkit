/** Convert dashed/underscored identifiers to PascalCase. */
export function pascalCase(input: string): string {
  return input
    .replace(/[-_]+/g, " ")
    .replace(/\s+(\w)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Convert identifiers to snake_case (lowercase, underscores). */
export function toSnake(input: string): string {
  return input
    .replace(/-/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
