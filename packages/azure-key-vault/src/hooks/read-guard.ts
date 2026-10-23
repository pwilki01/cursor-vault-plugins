import path from "node:path";
import { readStdinJson, writeHookDecision, workspaceRootsFrom } from "../../../core/src/hook-io.ts";
import { looksLikeEnvFile } from "../../../core/src/paths.ts";
import { placedPaths } from "../../../core/src/placements.ts";
import { loadProjectConfig } from "../../../core/src/config.ts";

const input = await readStdinJson<Record<string, unknown>>();
try {
  const filePath = String(input.file_path ?? "");
  const root = workspaceRootsFrom(input)[0] ?? process.cwd();
  const guarded = new Set([
    ...placedPaths(root).map((p) => path.resolve(p)),
    ...(loadProjectConfig(root).env_files ?? []).map((p) => path.resolve(root, p)),
  ]);
  if (guarded.has(path.resolve(filePath)) || looksLikeEnvFile(filePath)) {
    writeHookDecision({
      permission: "deny",
      user_message: "Blocked reading a file that holds placed Key Vault secrets.",
    });
    process.exit(0);
  }
} catch {
  /* fail open */
}
writeHookDecision({ permission: "allow" });
process.exit(0);
