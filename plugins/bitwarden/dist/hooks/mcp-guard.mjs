import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// packages/core/src/hook-io.ts
import { stdin } from "node:process";
async function readStdinText() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}
function writeHookDecision(decision) {
  process.stdout.write(`${JSON.stringify(decision)}
`);
}

// packages/core/src/command-guard.ts
function normalizeCommand(command) {
  return command.replace(/\\\r?\n/g, "").replace(/\$\{(\w+)\}/g, "$$$1").replace(/['"`\\]/g, "").replace(/\s+/g, " ").toLowerCase().trim();
}
var VAULT_RELATED = /\bbw\b|bitwarden|bw_session|secret-plugins|keyvault|vault\.azure/i;
function looksVaultRelated(text) {
  return VAULT_RELATED.test(text) || VAULT_RELATED.test(normalizeCommand(text));
}

// packages/bitwarden/src/hooks/mcp-guard.ts
var raw = await readStdinText();
try {
  const input = raw ? JSON.parse(raw) : {};
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
  writeHookDecision({ permission: "allow" });
} catch {
  writeHookDecision(
    looksVaultRelated(raw) ? { permission: "deny", agent_message: "The Bitwarden MCP guard could not check this call, so it was blocked." } : { permission: "allow" }
  );
}
process.exit(0);
