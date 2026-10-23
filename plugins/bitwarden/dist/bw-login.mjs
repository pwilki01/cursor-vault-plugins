#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// packages/bitwarden/src/bw-login.ts
import readline from "node:readline";
import { spawn as spawn2 } from "node:child_process";

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

// packages/core/src/spawn.ts
import { spawn } from "node:child_process";
function spawnCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (d) => stdoutChunks.push(d));
    child.stderr.on("data", (d) => stderrChunks.push(d));
    if (options.stdin != null) {
      child.stdin.end(options.stdin);
    } else {
      child.stdin.end();
    }
    const timer = options.timeoutMs != null ? setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out`));
    }, options.timeoutMs) : null;
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code2) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: code2,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks)
      });
    });
  });
}
function wipeBuffer(buf) {
  buf.fill(0);
}

// packages/bitwarden/src/bw-cli.ts
function bwCommand() {
  return process.env.BW_CLI_PATH || "bw";
}

// packages/bitwarden/src/login-launch.ts
var SIGNIN_BANNER = "=== Bitwarden sign-in (cursor-vault-plugins) ===";

// packages/core/src/credentials.ts
import fs2 from "node:fs";
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

// packages/bitwarden/src/bw-login.ts
function clearScreen() {
  process.stdout.write("\x1B[H\x1B[2J\x1B[3J");
}
function onExit() {
  clearScreen();
}
process.on("SIGINT", () => {
  onExit();
  process.exit(130);
});
process.on("exit", onExit);
process.stdout.write(`${SIGNIN_BANNER}
`);
process.stdout.write("This terminal is for Bitwarden sign-in. Passwords are hidden.\n\n");
var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
var ask = (q) => new Promise((resolve) => rl.question(q, resolve));
var askHidden = (q) => new Promise((resolve) => {
  process.stdout.write(q);
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode?.(true);
  stdin.resume();
  let acc = "";
  const onData = (d) => {
    const s = d.toString("utf8");
    if (s === "\n" || s === "\r") {
      stdin.setRawMode?.(wasRaw ?? false);
      stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(acc);
    } else if (s === "") {
      process.exit(130);
    } else if (s === "\x7F") {
      acc = acc.slice(0, -1);
    } else {
      acc += s;
    }
  };
  stdin.on("data", onData);
});
var method = (await ask("Login method [1] email + master password  [2] API key: ")).trim() || "1";
if (method === "2") {
  const clientId = (await ask("BW client id: ")).trim();
  const clientSecret = await askHidden("BW client secret: ");
  rl.close();
  const result = await spawnCapture(bwCommand(), ["login", "--apikey"], {
    env: { ...process.env, BW_CLIENTID: clientId, BW_CLIENTSECRET: clientSecret }
  });
  if (result.code !== 0) {
    wipeBuffer(result.stdout);
    process.stderr.write("Login failed.\n");
    process.exit(result.code ?? 1);
  }
} else {
  rl.close();
  await new Promise((resolve, reject) => {
    const child = spawn2(bwCommand(), ["login"], { stdio: "inherit" });
    child.on("exit", (code2) => code2 === 0 ? resolve() : reject(new Error("login failed")));
  });
}
var unlock = spawn2(bwCommand(), ["unlock", "--raw"], { stdio: ["inherit", "pipe", "inherit"] });
var session = "";
unlock.stdout.on("data", (d) => {
  session += d.toString("utf8");
  d.fill(0);
});
var code = await new Promise((resolve) => unlock.on("close", (c) => resolve(c ?? 1)));
if (code !== 0) process.exit(code);
await storeSession(session.trim());
session = "";
process.stdout.write("Done\n");
process.exit(0);
