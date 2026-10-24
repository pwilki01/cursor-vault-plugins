import { readStdinText, writeHookDecision } from "../../../core/src/hook-io.ts";
import { looksVaultRelated } from "../../../core/src/command-guard.ts";

const raw = await readStdinText();
try {
  const input = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
  const server = String(input.mcp_server_name ?? "");
  const tool = String(input.tool_name ?? "");
  const toolInput = String(input.tool_input ?? "");
  if (server === "azure-key-vault" && tool === "pipe_to_command") {
    writeHookDecision({
      permission: "ask",
      user_message: "Pipe a Key Vault secret to an external command?",
      agent_message: "pipe_to_command sends a secret to another program. Wait for approval.",
    });
    process.exit(0);
  }
  if (server === "azure" && /secret/i.test(`${tool} ${toolInput}`) && /get|show|value/i.test(`${tool} ${toolInput}`)) {
    writeHookDecision({
      permission: "deny",
      agent_message: "Do not use the Azure MCP to fetch secret values. Use find_secrets and placement tools.",
    });
    process.exit(0);
  }
  writeHookDecision({ permission: "allow" });
} catch {
  writeHookDecision(
    looksVaultRelated(raw)
      ? { permission: "deny", agent_message: "The Key Vault MCP guard could not check this call, so it was blocked." }
      : { permission: "allow" },
  );
}
process.exit(0);
