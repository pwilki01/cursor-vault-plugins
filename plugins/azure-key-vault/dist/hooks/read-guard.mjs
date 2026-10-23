import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// packages/azure-key-vault/src/hooks/read-guard.ts
import path5 from "node:path";

// packages/core/src/hook-io.ts
import { stdin } from "node:process";
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}
function writeHookDecision(decision) {
  process.stdout.write(`${JSON.stringify(decision)}
`);
}
function workspaceRootsFrom(input2) {
  const roots = input2.workspace_roots;
  if (Array.isArray(roots)) return roots.map(String);
  const cwd = input2.cwd ?? input2.tool_input?.working_directory;
  return cwd ? [String(cwd)] : [];
}

// packages/core/src/paths.ts
import path from "node:path";
var ENV_EXCEPTIONS = /\.(example|sample|template|dist)$/i;
function isEnvException(filePath) {
  return ENV_EXCEPTIONS.test(path.basename(filePath));
}
function looksLikeEnvFile(filePath) {
  const base = path.basename(filePath);
  if (isEnvException(filePath)) return false;
  return base === ".env" || base.startsWith(".env.");
}

// packages/core/src/placements.ts
import path3 from "node:path";

// packages/core/src/home.ts
import fs from "node:fs";
import os from "node:os";
import path2 from "node:path";
var SECRET_PLUGINS_DIR = path2.join(os.homedir(), ".cursor", "secret-plugins");
function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

// packages/core/src/placements.ts
function manifestPath(workspaceRoot) {
  return path3.join(workspaceRoot, ".cursor", "secret-placements.json");
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
import path4 from "node:path";
function loadProjectConfig(workspaceRoot) {
  return readJsonFile(path4.join(workspaceRoot, ".cursor", "secrets.json"), {});
}

// packages/azure-key-vault/src/hooks/read-guard.ts
var input = await readStdinJson();
try {
  const filePath = String(input.file_path ?? "");
  const root = workspaceRootsFrom(input)[0] ?? process.cwd();
  const guarded = /* @__PURE__ */ new Set([
    ...placedPaths(root).map((p) => path5.resolve(p)),
    ...(loadProjectConfig(root).env_files ?? []).map((p) => path5.resolve(root, p))
  ]);
  if (guarded.has(path5.resolve(filePath)) || looksLikeEnvFile(filePath)) {
    writeHookDecision({
      permission: "deny",
      user_message: "Blocked reading a file that holds placed Key Vault secrets."
    });
    process.exit(0);
  }
} catch {
}
writeHookDecision({ permission: "allow" });
process.exit(0);
