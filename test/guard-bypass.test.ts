import assert from "node:assert/strict";
import { test } from "node:test";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { azureLeak, bitwardenLeak, isVaultStatePath, normalizeCommand } from "../packages/core/src/command-guard.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooks = {
  bwShell: path.join(root, "packages/bitwarden/src/hooks/shell-guard.ts"),
  bwRead: path.join(root, "packages/bitwarden/src/hooks/read-guard.ts"),
  bwMcp: path.join(root, "packages/bitwarden/src/hooks/mcp-guard.ts"),
  azShell: path.join(root, "packages/azure-key-vault/src/hooks/shell-guard.ts"),
  azRead: path.join(root, "packages/azure-key-vault/src/hooks/read-guard.ts"),
};

const BW_BYPASSES = [
  "bw get password x",
  "b''w get password x",
  'b""w get password x',
  "b\\w get password x",
  "B=bw; $B get password x",
  "B=bw; ${B} get password x",
  "bw --session abc get password x",
  "bw --session=abc list items",
  "BW_SESSION=abc bw status",
  "echo $BW_SESSION",
  "security find-generic-password -s bitwarden-cursor-plugin -a BW_SESSION -w",
  "secret-tool lookup service bitwarden-cursor-plugin account BW_SESSION",
  "security dump-keychain -d",
  "cat ~/.cursor/secret-plugins/BW_SESSION.secret",
  'cat "$HOME/Library/Application Support/Bitwarden CLI/data.json"',
  "sh -c 'bw get item Github'",
];

const AZ_BYPASSES = [
  "az keyvault secret show --vault-name v -n db",
  "a''z keyvault secret show --vault-name v -n db",
  "S=show; az keyvault secret $S --vault-name v -n db",
  'az keyvault "secret" download --vault-name v -n cert -f out.pfx',
  "az rest --url https://v.vault.azure.net/secrets/db?api-version=7.4",
  'curl -H "Authorization: Bearer $T" https://v.vault.azure.net/secrets/db',
  "az account get-access-token --resource https://vault.azure.net",
  "az account get-access-token --scope https://vault.azure.net/.default",
];

const HARMLESS = [
  "npm test",
  "git status",
  "cat README.md",
  "ls -la",
  "/Users/me/.cursor/plugins/local/bitwarden/bin/bw-login",
  "/Users/me/.cursor/plugins/local/bitwarden/bin/secret-run -- npm start",
  "bw status",
  "az keyvault secret list --vault-name v",
  "az account show",
  "grep -r subway src/",
];

test("normalizeCommand strips quoting tricks", () => {
  assert.equal(normalizeCommand(`b''w  "get"  pass\\word`), "bw get password");
  assert.equal(normalizeCommand("${B} x"), "$b x");
});

for (const cmd of BW_BYPASSES) {
  test(`bitwardenLeak blocks: ${cmd}`, () => {
    assert.notEqual(bitwardenLeak(cmd), null);
  });
}

for (const cmd of AZ_BYPASSES) {
  test(`azureLeak blocks: ${cmd}`, () => {
    assert.notEqual(azureLeak(cmd), null);
  });
}

for (const cmd of HARMLESS) {
  test(`guards allow harmless: ${cmd}`, () => {
    assert.equal(bitwardenLeak(cmd), null);
    assert.equal(azureLeak(cmd), null);
  });
}

test("isVaultStatePath matches plugin and Bitwarden CLI storage", () => {
  assert.equal(isVaultStatePath(path.join(os.homedir(), ".cursor", "secret-plugins", "BW_SESSION.secret")), true);
  assert.equal(isVaultStatePath("/Users/me/Library/Application Support/Bitwarden CLI/data.json"), true);
  assert.equal(isVaultStatePath("/Users/me/project/README.md"), false);
});

const payload = (command: string) => ({ command, cwd: root, workspace_roots: [root] });

test("bitwarden shell-guard hook denies quoting and session-key bypasses", async () => {
  for (const cmd of ["b''w get password x", "bw --session abc get password x", "security find-generic-password -s bitwarden-cursor-plugin -a BW_SESSION -w"]) {
    const out = await runHook(hooks.bwShell, JSON.stringify(payload(cmd)));
    assert.equal(out.permission, "deny", cmd);
  }
});

test("bitwarden shell-guard hook allows harmless commands", async () => {
  const out = await runHook(hooks.bwShell, JSON.stringify(payload("git status")));
  assert.equal(out.permission, "allow");
});

test("azure shell-guard hook denies data-plane access", async () => {
  const out = await runHook(hooks.azShell, JSON.stringify(payload("az rest --url https://v.vault.azure.net/secrets/db")));
  assert.equal(out.permission, "deny");
});

test("shell guards fail closed on malformed vault-related input", async () => {
  for (const hook of [hooks.bwShell, hooks.azShell]) {
    const out = await runHook(hook, '{"command": "bw get password x", broken');
    assert.equal(out.permission, "deny", hook);
  }
  const az = await runHook(hooks.azShell, '{"command": "az keyvault secret show", broken');
  assert.equal(az.permission, "deny");
});

test("shell guards still allow malformed input unrelated to vaults", async () => {
  for (const hook of [hooks.bwShell, hooks.azShell]) {
    const out = await runHook(hook, '{"command": "git status", broken');
    assert.equal(out.permission, "allow", hook);
  }
});

test("read guards block plugin credential storage", async () => {
  const file = path.join(os.homedir(), ".cursor", "secret-plugins", "BW_SESSION.secret");
  for (const hook of [hooks.bwRead, hooks.azRead]) {
    const out = await runHook(hook, JSON.stringify({ file_path: file, workspace_roots: [root] }));
    assert.equal(out.permission, "deny", hook);
  }
});

test("mcp guard fails closed on malformed vault-related input", async () => {
  const out = await runHook(hooks.bwMcp, '{"mcp_server_name": "bitwarden", broken');
  assert.equal(out.permission, "deny");
});

function runHook(file: string, stdin: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", file], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("close", (code) => {
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop() || "{}"));
      } catch {
        reject(new Error(`hook exited ${code}: ${stderr}`));
      }
    });
    child.stdin.end(stdin);
  });
}
