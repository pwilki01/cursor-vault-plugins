import path from "node:path";
import { loadProjectConfig } from "../../../core/src/config.ts";
import { commandFrom, readStdinText, writeHookDecision, workspaceRootsFrom } from "../../../core/src/hook-io.ts";
import { azureLeak, looksVaultRelated } from "../../../core/src/command-guard.ts";
import { looksLikeEnvFile, isEnvException } from "../../../core/src/paths.ts";
import { placedPaths } from "../../../core/src/placements.ts";

const READ_CMDS = /\b(cat|head|tail|less|more|grep|rg|sed|awk|source|\.|base64|cp)\b/i;

const raw = await readStdinText();
let command = "";
try {
  const input = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
  command = commandFrom(input);
  const root = workspaceRootsFrom(input)[0] ?? process.cwd();
  const leak = azureLeak(command);
  if (leak) {
    writeHookDecision({
      permission: "deny",
      agent_message:
        leak === "az-cli"
          ? "Do not use az keyvault secret show/download/backup. Call find_secrets or the placement tools."
          : "Do not call the Key Vault data plane or mint Key Vault tokens directly. Call find_secrets or the placement tools.",
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
  writeHookDecision({ permission: "allow" });
} catch {
  writeHookDecision(
    looksVaultRelated(command || raw)
      ? { permission: "deny", agent_message: "The Key Vault guard could not check this command, so it was blocked." }
      : { permission: "allow" },
  );
}
process.exit(0);
