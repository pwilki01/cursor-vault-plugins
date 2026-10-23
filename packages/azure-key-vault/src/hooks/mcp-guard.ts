import { readStdinJson, writeHookDecision } from "../../../core/src/hook-io.ts";

const input = await readStdinJson<Record<string, unknown>>();
try {
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
} catch {
  /* fail open */
}
writeHookDecision({ permission: "allow" });
process.exit(0);
