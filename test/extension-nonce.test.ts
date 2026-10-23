import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeLoginNonce, loginNoncePath } from "../packages/core/src/registry.ts";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const ext = require(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "extensions/bitwarden-signin/extension.js"));

test("extension nonce is one-time and helper path does not come from the URI", () => {
  try {
    fs.unlinkSync(loginNoncePath());
  } catch {
    /* none */
  }
  assert.equal(ext.consumeNonce("anything"), false);

  writeLoginNonce("good");
  assert.equal(ext.consumeNonce("bad"), false);

  writeLoginNonce("good");
  assert.equal(ext.consumeNonce("good"), true);
  assert.equal(ext.consumeNonce("good"), false);

  assert.equal(typeof ext.loginHelperPath, "function");
});
