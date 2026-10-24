import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// packages/bitwarden/src/hooks/read-guard.ts
import path6 from "node:path";

// packages/core/src/hook-io.ts
import { stdin } from "node:process";
async function readStdinText() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}
function writeHookDecision(decision) {
  process.stdout.write(`${JSON.stringify(decision)}
`);
}
function workspaceRootsFrom(input) {
  const roots = input.workspace_roots;
  if (Array.isArray(roots)) return roots.map(String);
  const cwd = input.cwd ?? input.tool_input?.working_directory;
  return cwd ? [String(cwd)] : [];
}

// packages/core/src/command-guard.ts
import path from "node:path";
function normalizeCommand(command) {
  return command.replace(/\\\r?\n/g, "").replace(/\$\{(\w+)\}/g, "$$$1").replace(/['"`\\]/g, "").replace(/\s+/g, " ").toLowerCase().trim();
}
var VAULT_RELATED = /\bbw\b|bitwarden|bw_session|secret-plugins|keyvault|vault\.azure/i;
function looksVaultRelated(text) {
  return VAULT_RELATED.test(text) || VAULT_RELATED.test(normalizeCommand(text));
}
function isVaultStatePath(filePath2) {
  if (!filePath2) return false;
  const p = path.resolve(filePath2).split(path.sep).join("/").toLowerCase();
  return p.includes("/.cursor/secret-plugins/") || p.endsWith("/.cursor/secret-plugins") || p.includes("/bitwarden cli/");
}

// packages/core/src/paths.ts
import path2 from "node:path";
var ENV_EXCEPTIONS = /\.(example|sample|template|dist)$/i;
function isEnvException(filePath2) {
  return ENV_EXCEPTIONS.test(path2.basename(filePath2));
}
function looksLikeEnvFile(filePath2) {
  const base = path2.basename(filePath2);
  if (isEnvException(filePath2)) return false;
  return base === ".env" || base.startsWith(".env.");
}

// packages/core/src/placements.ts
import path4 from "node:path";

// packages/core/src/home.ts
import fs from "node:fs";
import os from "node:os";
import path3 from "node:path";
var SECRET_PLUGINS_DIR = path3.join(os.homedir(), ".cursor", "secret-plugins");
function readJsonFile(filePath2, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath2, "utf8"));
  } catch {
    return fallback;
  }
}

// packages/core/src/placements.ts
function manifestPath(workspaceRoot) {
  return path4.join(workspaceRoot, ".cursor", "secret-placements.json");
}
function loadPlacements(workspaceRoot) {
  return readJsonFile(manifestPath(workspaceRoot), { placements: [] }).placements;
}
function placedPaths(workspaceRoot) {
  return loadPlacements(workspaceRoot).map((p) => {
    if (p.destination.kind === "dotenv") return p.destination.path;
    if (p.destination.kind === "template") return p.destination.outputPath;
    return null;
  }).filter((p) => Boolean(p));
}

// packages/core/src/config.ts
import path5 from "node:path";
function loadProjectConfig(workspaceRoot) {
  return readJsonFile(path5.join(workspaceRoot, ".cursor", "secrets.json"), {});
}

// packages/bitwarden/src/login-launch.ts
var SIGNIN_BANNER = "=== Bitwarden sign-in (cursor-vault-plugins) ===";

// packages/bitwarden/src/hooks/read-guard.ts
var raw = await readStdinText();
var filePath = "";
try {
  const input = raw ? JSON.parse(raw) : {};
  filePath = String(input.file_path ?? "");
  const content = String(input.content ?? "");
  const roots = workspaceRootsFrom(input);
  const root = roots[0] ?? process.cwd();
  const config = loadProjectConfig(root);
  const guarded = /* @__PURE__ */ new Set([
    ...placedPaths(root).map((p) => path6.resolve(p)),
    ...(config.env_files ?? []).map((p) => path6.resolve(root, p))
  ]);
  if (content.includes(SIGNIN_BANNER) || filePath.includes(`${path6.sep}terminals${path6.sep}`)) {
    writeHookDecision({
      permission: "deny",
      user_message: "Blocked reading a Bitwarden sign-in terminal transcript."
    });
    process.exit(0);
  }
  if (guarded.has(path6.resolve(filePath)) || looksLikeEnvFile(filePath) || isVaultStatePath(filePath)) {
    writeHookDecision({
      permission: "deny",
      user_message: "Blocked reading a file that holds placed Bitwarden secrets. Use find_logins for names."
    });
    process.exit(0);
  }
  writeHookDecision({ permission: "allow" });
} catch {
  writeHookDecision(
    looksLikeEnvFile(filePath) || isVaultStatePath(filePath) || looksVaultRelated(filePath) ? { permission: "deny", user_message: "The Bitwarden read guard could not check this file, so it was blocked." } : { permission: "allow" }
  );
}
process.exit(0);
