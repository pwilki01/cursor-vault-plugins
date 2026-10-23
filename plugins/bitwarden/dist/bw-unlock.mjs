#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// packages/bitwarden/src/bw-unlock.ts
import { spawn as spawn2 } from "node:child_process";

// packages/core/src/spawn.ts
import { spawn } from "node:child_process";
function spawnCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child2 = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child2.stdout.on("data", (d) => stdoutChunks.push(d));
    child2.stderr.on("data", (d) => stderrChunks.push(d));
    if (options.stdin != null) {
      child2.stdin.end(options.stdin);
    } else {
      child2.stdin.end();
    }
    const timer = options.timeoutMs != null ? setTimeout(() => {
      child2.kill("SIGKILL");
      reject(new Error(`${command} timed out`));
    }, options.timeoutMs) : null;
    child2.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child2.on("close", (code2) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: code2,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks)
      });
    });
  });
}

// packages/bitwarden/src/bw-cli.ts
function bwCommand() {
  return process.env.BW_CLI_PATH || "bw";
}

// packages/core/src/credentials.ts
import fs2 from "node:fs";

// packages/core/src/home.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var SECRET_PLUGINS_DIR = path.join(os.homedir(), ".cursor", "secret-plugins");
function ensureSecretPluginsDir() {
  fs.mkdirSync(SECRET_PLUGINS_DIR, { recursive: true, mode: 448 });
  return SECRET_PLUGINS_DIR;
}
function secretPluginsPath(...parts) {
  return path.join(ensureSecretPluginsDir(), ...parts);
}
function writeJsonFile(filePath, value, mode = 384) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 448 });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}
`, { mode });
  fs.renameSync(tmp, filePath);
}

// packages/core/src/credentials.ts
var SERVICE = "bitwarden-cursor-plugin";
function fileSecretPath(account) {
  const safe = account.replace(/[^A-Za-z0-9._-]/g, "_");
  return secretPluginsPath(`${safe}.secret`);
}
function writeFileSecret(account, value) {
  fs2.writeFileSync(fileSecretPath(account), value, { mode: 384 });
}
async function setSecret(account, value) {
  if (process.platform === "darwin") {
    await spawnCapture("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", value]);
    return;
  }
  if (process.platform === "linux") {
    await spawnCapture("secret-tool", ["store", "--label", `${SERVICE} ${account}`, "service", SERVICE, "account", account], {
      stdin: value
    });
    return;
  }
  writeFileSecret(account, value);
}

// packages/bitwarden/src/session.ts
var SESSION_ACCOUNT = "BW_SESSION";
function statePath() {
  return secretPluginsPath("bitwarden-state.json");
}
function nowMs(clock) {
  return clock ? clock() : Date.now();
}
function touchLastUsed(clock) {
  writeJsonFile(statePath(), { lastUsedAt: nowMs(clock) });
}
async function storeSession(session2, clock) {
  await setSecret(SESSION_ACCOUNT, session2);
  touchLastUsed(clock);
}

// packages/bitwarden/src/bw-unlock.ts
process.stdout.write("Unlock Bitwarden. The session key will be stored in the OS keychain, not printed.\n");
var child = spawn2(bwCommand(), ["unlock", "--raw"], { stdio: ["inherit", "pipe", "inherit"] });
var session = "";
child.stdout.on("data", (d) => {
  session += d.toString("utf8");
  d.fill(0);
});
var code = await new Promise((resolve) => child.on("close", (c) => resolve(c ?? 1)));
if (code !== 0) process.exit(code);
await storeSession(session.trim());
process.stdout.write("Unlocked.\n");
