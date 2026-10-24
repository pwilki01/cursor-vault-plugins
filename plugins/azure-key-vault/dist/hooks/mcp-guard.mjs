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

// packages/azure-key-vault/src/hooks/mcp-guard.ts
var raw = await readStdinText();
try {
  const input = raw ? JSON.parse(raw) : {};
  const server = String(input.mcp_server_name ?? "");
  const tool = String(input.tool_name ?? "");
  const toolInput = String(input.tool_input ?? "");
  if (server === "azure-key-vault" && tool === "pipe_to_command") {
    writeHookDecision({
      permission: "ask",
      user_message: "Pipe a Key Vault secret to an external command?",
      agent_message: "pipe_to_command sends a secret to another program. Wait for approval."
    });
    process.exit(0);
  }
  if (server === "azure" && /secret/i.test(`${tool} ${toolInput}`) && /get|show|value/i.test(`${tool} ${toolInput}`)) {
    writeHookDecision({
      permission: "deny",
      agent_message: "Do not use the Azure MCP to fetch secret values. Use find_secrets and placement tools."
    });
    process.exit(0);
  }
  writeHookDecision({ permission: "allow" });
} catch {
  writeHookDecision(
    looksVaultRelated(raw) ? { permission: "deny", agent_message: "The Key Vault MCP guard could not check this call, so it was blocked." } : { permission: "allow" }
  );
}
process.exit(0);
