import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

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

// packages/bitwarden/src/hooks/mcp-guard.ts
var input = await readStdinJson();
try {
  const server = String(input.mcp_server_name ?? "");
  const tool = String(input.tool_name ?? "");
  const toolInput = String(input.tool_input ?? "");
  if (server === "bitwarden" && tool === "pipe_to_command") {
    writeHookDecision({
      permission: "ask",
      user_message: "Pipe a Bitwarden secret to an external command?",
      agent_message: "pipe_to_command sends a secret to another program. Wait for the user to approve."
    });
    process.exit(0);
  }
  const officialGet = (server === "bitwarden" || server.includes("bitwarden")) && /^(get|get_item)$/i.test(tool) && /password|totp|item/i.test(`${tool} ${toolInput}`);
  if (officialGet && server !== "bitwarden") {
    writeHookDecision({
      permission: "deny",
      agent_message: "Do not use the official Bitwarden MCP get tools. Use find_logins and the placement tools instead."
    });
    process.exit(0);
  }
  if (server === "azure" && /keyvault|secret/i.test(`${tool} ${toolInput}`) && /get|show|value/i.test(`${tool} ${toolInput}`)) {
    writeHookDecision({
      permission: "deny",
      agent_message: "Do not use Azure MCP to read secret values. Use the azure-key-vault plugin find_secrets and placement tools."
    });
    process.exit(0);
  }
} catch {
}
writeHookDecision({ permission: "allow" });
process.exit(0);
