import path from "node:path";
import { readStdinJson, writeHookDecision, workspaceRootsFrom } from "../../../core/src/hook-io.ts";
import { looksLikeEnvFile } from "../../../core/src/paths.ts";
import { placedPaths } from "../../../core/src/placements.ts";
import { loadProjectConfig } from "../../../core/src/config.ts";
import { SIGNIN_BANNER } from "../login-launch.ts";

const input = await readStdinJson<Record<string, unknown>>();
try {
  const filePath = String(input.file_path ?? "");
  const content = String(input.content ?? "");
  const roots = workspaceRootsFrom(input);
  const root = roots[0] ?? process.cwd();
  const config = loadProjectConfig(root);
  const guarded = new Set([
    ...placedPaths(root).map((p) => path.resolve(p)),
    ...(config.env_files ?? []).map((p) => path.resolve(root, p)),
  ]);

  if (content.includes(SIGNIN_BANNER) || filePath.includes(`${path.sep}terminals${path.sep}`)) {
    writeHookDecision({
      permission: "deny",
      user_message: "Blocked reading a Bitwarden sign-in terminal transcript.",
    });
    process.exit(0);
  }

  if (guarded.has(path.resolve(filePath)) || looksLikeEnvFile(filePath)) {
    writeHookDecision({
      permission: "deny",
      user_message: "Blocked reading a file that holds placed Bitwarden secrets. Use find_logins for names.",
    });
    process.exit(0);
  }
} catch {
  /* fail open */
}
writeHookDecision({ permission: "allow" });
process.exit(0);
