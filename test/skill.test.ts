import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const skill = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../plugins/bitwarden/skills/bitwarden-passwords/SKILL.md"),
  "utf8",
);

test("skill documents search-only find_logins workflow", () => {
  assert.match(skill, /find_logins/);
  assert.match(skill, /acme corp/);
  assert.match(skill, /\*\*Stop\.\*\*/);
  assert.match(skill, /exact/i);
  assert.match(skill, /Do not call `place_\*`/);
  assert.match(skill, /Never guess/);
  assert.match(skill, /radio picker/);
  assert.match(skill, /AskQuestion/);
  assert.match(skill, /bw get password/);
});
