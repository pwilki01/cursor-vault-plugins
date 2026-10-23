import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function mustExist(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`missing ${rel}`);
    process.exit(1);
  }
}

for (const rel of [
  "plugins/bitwarden/.cursor-plugin/plugin.json",
  "plugins/bitwarden/dist/server.mjs",
  "plugins/bitwarden/bin/shell-guard",
  "plugins/azure-key-vault/.cursor-plugin/plugin.json",
  "plugins/azure-key-vault/dist/server.mjs",
]) {
  mustExist(rel);
}

const hashFile = (rel) => createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex");
if (!hashFile("plugins/bitwarden/dist/server.mjs")) {
  process.exit(1);
}
console.log("validate ok");
