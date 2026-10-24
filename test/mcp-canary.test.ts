import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CANARY = "CANARY_PASSWORD";
const dir = path.dirname(fileURLToPath(import.meta.url));
const stub = path.join(dir, "fixtures", "bw-stub.mjs");

test("provider find_logins over stub omits canary from serialized MCP-style payload", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "vault-mcp-"));
  const script = `
    import { BitwardenProvider } from ${JSON.stringify(path.join(dir, "../packages/bitwarden/src/provider.ts"))};
    process.env.BW_CLI_PATH = ${JSON.stringify(stub)};
    process.env.BW_SESSION = "test-session";
    const p = new BitwardenProvider([${JSON.stringify(workspace)}]);
    const result = await p.findLogins("acme corp");
    process.stdout.write(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(result) }] }));
  `;
  const file = path.join(workspace, "run.ts");
  fs.writeFileSync(file, script);
  const { stdout, stderr } = await runNode(file);
  assert.equal(stdout.includes(CANARY), false);
  assert.equal(stderr.includes(CANARY), false);
  const payload = JSON.parse(stdout);
  const inner = JSON.parse(payload.content[0].text);
  assert.equal(inner.matches[0].name, "Acme Corp CRM");
});

function runNode(file: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", file], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      if (code !== 0 && !stdout) reject(new Error(stderr || `exit ${code}`));
      else resolve({ stdout, stderr });
    });
  });
}
