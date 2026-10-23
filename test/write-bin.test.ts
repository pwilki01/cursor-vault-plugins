import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { writeBinLauncher } from "../scripts/write-bin.mjs";

test("unix launcher finds node even with a thin PATH", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-bin-"));
  fs.mkdirSync(path.join(dir, "dist"));
  fs.writeFileSync(path.join(dir, "dist", "echo.mjs"), "console.log('ok');\n");
  writeBinLauncher(dir, "echo-bin", "dist/echo.mjs");
  const launcher = path.join(dir, "bin", "echo-bin");
  const result = spawnSync(launcher, [], {
    env: { PATH: "/usr/bin:/bin", HOME: os.homedir() },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "ok");
});

test("unix launcher prefers node already on PATH over /usr/local/bin", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-bin-"));
  fs.mkdirSync(path.join(dir, "dist"));
  fs.mkdirSync(path.join(dir, "path-node"));
  fs.writeFileSync(path.join(dir, "dist", "echo.mjs"), "console.log('ok');\n");
  fs.writeFileSync(path.join(dir, "path-node", "node"), "#!/bin/sh\necho path-node\n", { mode: 0o755 });
  writeBinLauncher(dir, "echo-bin", "dist/echo.mjs");
  const result = spawnSync(path.join(dir, "bin", "echo-bin"), [], {
    env: { PATH: `${path.join(dir, "path-node")}:/usr/bin:/bin`, HOME: os.homedir() },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "path-node");
});
