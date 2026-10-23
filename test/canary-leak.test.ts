import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BitwardenProvider } from "../packages/bitwarden/src/provider.ts";
import { isIdleExpired, touchLastUsed } from "../packages/bitwarden/src/session.ts";
import { maskText, StreamMasker, encodingsOf } from "../packages/core/src/masker.ts";
import { safeErrorMessage } from "../packages/core/src/masker.ts";
import { matchSecrets } from "../packages/azure-key-vault/src/provider.ts";

const CANARY = "CANARY_PASSWORD";
const root = path.dirname(fileURLToPath(import.meta.url));
const stub = path.join(root, "fixtures", "bw-stub.mjs");

function withStubEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BW_CLI_PATH: process.execPath,
    BW_SESSION: "test-session",
  };
}

async function findWithStub(query: string) {
  const prevPath = process.env.BW_CLI_PATH;
  const prevSession = process.env.BW_SESSION;
  process.env.BW_CLI_PATH = process.execPath;
  process.env.BW_SESSION = "test-session";
  const origSpawnArg = process.argv;
  try {
    process.env.BW_CLI_PATH = stub;
    touchLastUsed();
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "vault-ws-"));
    const provider = new BitwardenProvider([workspace]);
    const logs: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      logs.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const result = await provider.findLogins(query);
      return { result, logs: logs.join(""), json: JSON.stringify(result) };
    } finally {
      process.stderr.write = origWrite;
    }
  } finally {
    process.env.BW_CLI_PATH = prevPath;
    process.env.BW_SESSION = prevSession;
    void origSpawnArg;
    void withStubEnv;
  }
}

test("find_logins with stub returns exact name and no canary", async () => {
  const { result, logs, json } = await findWithStub("aon intelligence");
  assert.equal(result.count, 1);
  assert.equal(result.matches[0].name, "Aon Intelligence CRM");
  assert.equal(json.includes(CANARY), false);
  assert.equal(logs.includes(CANARY), false);
});

test("find_logins does not match the canary password", async () => {
  const { result } = await findWithStub(CANARY);
  assert.equal(result.count, 0);
  assert.equal(result.matches.length, 0);
  assert.equal(JSON.stringify(result.matches).includes(CANARY), false);
});

test("masker hides canary including encodings and split chunks", () => {
  const encoded = encodingsOf(CANARY);
  assert.ok(encoded.includes(CANARY));
  const text = `pre ${CANARY} ${Buffer.from(CANARY).toString("base64")} post`;
  assert.equal(maskText(text, [CANARY]).includes(CANARY), false);
  const masker = new StreamMasker([CANARY]);
  const a = masker.push(CANARY.slice(0, 4));
  const b = masker.push(CANARY.slice(4));
  const c = masker.flush();
  const out = a + b + c;
  assert.equal(out.includes(CANARY), false);
  assert.equal(safeErrorMessage(new Error(`failed ${CANARY}`), [CANARY]).includes(CANARY), false);
});

test("shell-guard denies bw get password and omits canary", async () => {
  const hook = path.join(root, "..", "packages/bitwarden/src/hooks/shell-guard.ts");
  const out = await runHook(hook, { command: "bw get password Github", cwd: process.cwd(), workspace_roots: [process.cwd()] });
  assert.equal(out.permission, "deny");
  assert.equal(JSON.stringify(out).includes(CANARY), false);
  assert.match(String(out.agent_message), /find_logins/);
});

test("shell-guard denies bw list items", async () => {
  const hook = path.join(root, "..", "packages/bitwarden/src/hooks/shell-guard.ts");
  const out = await runHook(hook, { command: "bw list items --search foo", cwd: process.cwd(), workspace_roots: [process.cwd()] });
  assert.equal(out.permission, "deny");
});

test("idle expiration treats old timestamps as locked", () => {
  const now = 1_000_000;
  assert.equal(isIdleExpired(now - 61 * 60_000, 60, () => now), true);
  assert.equal(isIdleExpired(now - 10 * 60_000, 60, () => now), false);
});

test("azure find_secrets matcher is metadata-only", () => {
  const matches = matchSecrets(
    [
      { name: "stripe-key", contentType: "text", tags: { app: "billing" }, enabled: true, updated: "t" },
      { name: "other", contentType: CANARY, tags: {}, enabled: true, updated: "t" },
    ],
    "stripe",
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, "stripe-key");
  assert.equal(JSON.stringify(matches).includes("value"), false);
});

function runHook(file: string, payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", file], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("close", () => {
      if (stderr.includes(CANARY) || stdout.includes(CANARY)) {
        reject(new Error("canary leaked from hook"));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop() || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
