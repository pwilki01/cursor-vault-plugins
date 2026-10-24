import path from "node:path";
import { readStdinText, writeHookDecision, workspaceRootsFrom } from "../../../core/src/hook-io.ts";
import { isVaultStatePath, looksVaultRelated } from "../../../core/src/command-guard.ts";
import { looksLikeEnvFile } from "../../../core/src/paths.ts";
import { placedPaths } from "../../../core/src/placements.ts";
import { loadProjectConfig } from "../../../core/src/config.ts";

const RAW_ENV_PATH = /[\\/"]\.env(?!\.(example|sample|template|dist)")(\.[\w-]+)?"/i;

const raw = await readStdinText();
let filePath = "";
try {
  const input = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
  filePath = String(input.file_path ?? "");
  const root = workspaceRootsFrom(input)[0] ?? process.cwd();
  const guarded = new Set([
    ...placedPaths(root).map((p) => path.resolve(p)),
    ...(loadProjectConfig(root).env_files ?? []).map((p) => path.resolve(root, p)),
  ]);
  if (guarded.has(path.resolve(filePath)) || looksLikeEnvFile(filePath) || isVaultStatePath(filePath)) {
    writeHookDecision({
      permission: "deny",
      user_message: "Blocked reading a file that holds placed Key Vault secrets.",
    });
    process.exit(0);
  }
  writeHookDecision({ permission: "allow" });
} catch {
  writeHookDecision(
    looksLikeEnvFile(filePath) || isVaultStatePath(filePath) || looksVaultRelated(filePath || raw) || RAW_ENV_PATH.test(raw)
      ? { permission: "deny", user_message: "The Key Vault read guard could not check this file, so it was blocked." }
      : { permission: "allow" },
  );
}
process.exit(0);
