import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// packages/azure-key-vault/src/hooks/shell-guard.ts
import path5 from "node:path";

// packages/core/src/config.ts
import path2 from "node:path";

// packages/core/src/home.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var SECRET_PLUGINS_DIR = path.join(os.homedir(), ".cursor", "secret-plugins");
function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

// packages/core/src/config.ts
function loadProjectConfig(workspaceRoot) {
  return readJsonFile(path2.join(workspaceRoot, ".cursor", "secrets.json"), {});
}

// packages/core/src/hook-io.ts
import { stdin } from "node:process";
async function readStdinText() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}
function commandFrom(input) {
  if (typeof input.command === "string") return input.command;
  const tool = input.tool_input;
  return typeof tool?.command === "string" ? tool.command : "";
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
function normalizeCommand(command2) {
  return command2.replace(/\\\r?\n/g, "").replace(/\$\{(\w+)\}/g, "$$$1").replace(/['"`\\]/g, "").replace(/\s+/g, " ").toLowerCase().trim();
}
var AZ_WORD = /(?<![\w.-])az(\.cmd|\.exe)?(?![\w.-])/;
function azureLeak(command2) {
  const n = normalizeCommand(command2);
  if (n.includes("vault.azure.net")) return "data-plane";
  if (/\bget-access-token\b/.test(n) && /vault/.test(n)) return "vault-token";
  if (AZ_WORD.test(n) && /\bkeyvault\b/.test(n) && /\bsecret\b/.test(n) && /\b(show|download|backup)\b/.test(n)) {
    return "az-cli";
  }
  return null;
}
var VAULT_RELATED = /\bbw\b|bitwarden|bw_session|secret-plugins|keyvault|vault\.azure/i;
function looksVaultRelated(text) {
  return VAULT_RELATED.test(text) || VAULT_RELATED.test(normalizeCommand(text));
}

// packages/core/src/paths.ts
import path3 from "node:path";
var ENV_EXCEPTIONS = /\.(example|sample|template|dist)$/i;
function isEnvException(filePath) {
  return ENV_EXCEPTIONS.test(path3.basename(filePath));
}
function looksLikeEnvFile(filePath) {
  const base = path3.basename(filePath);
  if (isEnvException(filePath)) return false;
  return base === ".env" || base.startsWith(".env.");
}

// packages/core/src/placements.ts
import path4 from "node:path";
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

// packages/azure-key-vault/src/hooks/shell-guard.ts
var READ_CMDS = /\b(cat|head|tail|less|more|grep|rg|sed|awk|source|\.|base64|cp)\b/i;
var raw = await readStdinText();
var command = "";
try {
  const input = raw ? JSON.parse(raw) : {};
  command = commandFrom(input);
  const root = workspaceRootsFrom(input)[0] ?? process.cwd();
  const leak = azureLeak(command);
  if (leak) {
    writeHookDecision({
      permission: "deny",
      agent_message: leak === "az-cli" ? "Do not use az keyvault secret show/download/backup. Call find_secrets or the placement tools." : "Do not call the Key Vault data plane or mint Key Vault tokens directly. Call find_secrets or the placement tools."
    });
    process.exit(0);
  }
  const config = loadProjectConfig(root);
  if (READ_CMDS.test(command)) {
    const guarded = [...placedPaths(root), ...(config.env_files ?? []).map((p) => path5.resolve(root, p))];
    const touches = guarded.some((p) => command.includes(p)) || /\.env(\.|$|\s)/.test(command) && !isEnvException(command);
    if (touches || looksLikeEnvFile(command)) {
      writeHookDecision({
        permission: "deny",
        agent_message: "Do not read secret destination files. Use find_secrets for names."
      });
      process.exit(0);
    }
  }
  writeHookDecision({ permission: "allow" });
} catch {
  writeHookDecision(
    looksVaultRelated(command || raw) ? { permission: "deny", agent_message: "The Key Vault guard could not check this command, so it was blocked." } : { permission: "allow" }
  );
}
process.exit(0);
