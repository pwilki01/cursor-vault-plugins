import path from "node:path";
import { loadProjectConfig } from "../../../core/src/config.ts";
import { readStdinJson, writeHookDecision, workspaceRootsFrom } from "../../../core/src/hook-io.ts";
import { looksLikeEnvFile, isEnvException } from "../../../core/src/paths.ts";
import { placedPaths } from "../../../core/src/placements.ts";

const AZ_LEAK = /\baz(\.cmd|\.exe)?\s+keyvault\s+secret\s+(show|download|backup)\b/i;
const READ_CMDS = /\b(cat|head|tail|less|more|grep|rg|sed|awk|source|\.|base64|cp)\b/i;

const input = await readStdinJson<Record<string, unknown>>();
try {
  const command = String(input.command ?? (input.tool_input as { command?: string } | undefined)?.command ?? "");
  const root = workspaceRootsFrom(input)[0] ?? process.cwd();
  if (AZ_LEAK.test(command)) {
    writeHookDecision({
      permission: "deny",
      agent_message: "Do not use az keyvault secret show/download/backup. Call find_secrets or the placement tools.",
    });
    process.exit(0);
  }
  const config = loadProjectConfig(root);
  if (READ_CMDS.test(command)) {
    const guarded = [...placedPaths(root), ...(config.env_files ?? []).map((p) => path.resolve(root, p))];
    const touches = guarded.some((p) => command.includes(p)) || (/\.env(\.|$|\s)/.test(command) && !isEnvException(command));
    if (touches || looksLikeEnvFile(command)) {
      writeHookDecision({
        permission: "deny",
        agent_message: "Do not read secret destination files. Use find_secrets for names.",
      });
      process.exit(0);
    }
  }
} catch {
  /* fail open */
}
writeHookDecision({ permission: "allow" });
process.exit(0);
