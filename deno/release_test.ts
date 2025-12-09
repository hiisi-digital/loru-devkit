import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { _changelogPath, _pathSafeId, _writeChangelog } from "./release.ts";

Deno.test("pathSafeId replaces path separators", () => {
  assertEquals(_pathSafeId("@loru/devkit"), "@loru@devkit");
  assertEquals(_pathSafeId("plain"), "plain");
});

Deno.test("writeChangelog creates a file with a safe name", async () => {
  const tmp = await Deno.makeTempDir();
  const prev = Deno.cwd();
  Deno.chdir(tmp);
  try {
    const entry = {
      kind: "lib" as const,
      id: "@loru/devkit",
      name: "@loru/devkit",
      baseDir: tmp,
      path: tmp,
    };
    const path = await _writeChangelog(entry, "1.2.3");
    assertEquals(path, _changelogPath(entry, "1.2.3"));
    const stat = await Deno.stat(path);
    assert(stat.isFile);
  } finally {
    Deno.chdir(prev);
    await Deno.remove(tmp, { recursive: true });
  }
});
