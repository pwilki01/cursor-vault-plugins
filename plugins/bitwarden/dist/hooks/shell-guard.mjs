import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// packages/bitwarden/src/hooks/shell-guard.ts
import path5 from "node:path";

// packages/core/src/config.ts
import fs2 from "node:fs";
import path2 from "node:path";

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
function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

// packages/core/src/config.ts
function loadProjectConfig(workspaceRoot) {
  return readJsonFile(path2.join(workspaceRoot, ".cursor", "secrets.json"), {});
}
function defaultWrapMode(config) {
  return config.wrap_mode === "suggest" ? "suggest" : "rewrite";
}
function readAutolockMinutes() {
  const homeConfig = path2.join(process.env.HOME ?? "", ".cursor", "secret-plugins", "config.json");
  try {
    const parsed = JSON.parse(fs2.readFileSync(homeConfig, "utf8"));
    if (typeof parsed.autolock_minutes === "number" && parsed.autolock_minutes > 0) {
      return parsed.autolock_minutes;
    }
  } catch {
  }
  return 60;
}

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
function workspaceRootsFrom(input2) {
  const roots = input2.workspace_roots;
  if (Array.isArray(roots)) return roots.map(String);
  const cwd = input2.cwd ?? input2.tool_input?.working_directory;
  return cwd ? [String(cwd)] : [];
}

// packages/core/src/paths.ts
import path3 from "node:path";

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
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks)
      });
    });
  });
}
function wipeBuffer(buf) {
  buf.fill(0);
}

// packages/core/src/paths.ts
var ENV_EXCEPTIONS = /\.(example|sample|template|dist)$/i;
function isEnvException(filePath) {
  return ENV_EXCEPTIONS.test(path3.basename(filePath));
}
function looksLikeEnvFile(filePath) {
  const base = path3.basename(filePath);
  if (isEnvException(filePath)) return false;
  return base === ".env" || base.startsWith(".env.");
}

// packages/core/src/placements.ts
import path4 from "node:path";
function manifestPath(workspaceRoot) {
  return path4.join(workspaceRoot, ".cursor", "secret-placements.json");
}
function loadPlacements(workspaceRoot) {
  return readJsonFile(manifestPath(workspaceRoot), { placements: [] }).placements;
}
function placedPaths(workspaceRoot) {
  return loadPlacements(workspaceRoot).map((p) => {
    if (p.destination.kind === "dotenv") return p.destination.path;
    if (p.destination.kind === "template") return p.destination.outputPath;
    return null;
  }).filter((p) => Boolean(p));
}

// packages/bitwarden/src/strip.ts
function parseJsonAndWipe(buf) {
  const text = buf.toString("utf8");
  buf.fill(0);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Bitwarden CLI returned invalid JSON.");
  }
}

// packages/bitwarden/src/bw-cli.ts
function bwCommand() {
  return process.env.BW_CLI_PATH || "bw";
}
async function bwRaw(args, env = process.env) {
  try {
    const command = bwCommand();
    if (command.endsWith(".mjs") || command.endsWith(".js") || command.endsWith(".ts")) {
      return await spawnCapture(process.execPath, [command, ...args], { env, timeoutMs: 6e4 });
    }
    return await spawnCapture(command, args, { env, timeoutMs: 6e4 });
  } catch (err) {
    if (err.code === "ENOENT") {
      const empty = Buffer.alloc(0);
      return { code: 127, stdout: empty, stderr: Buffer.from("bw CLI is not installed") };
    }
    throw err;
  }
}
async function readStatus(session) {
  const env = { ...process.env };
  if (session) env.BW_SESSION = session;
  const result = await bwRaw(["status"], env);
  if (result.code === 127) {
    return { installed: false, serverUrl: null, state: "missing-cli" };
  }
  let parsed = {};
  try {
    parsed = parseJsonAndWipe(result.stdout) ?? {};
  } catch {
    wipeBuffer(result.stdout);
  }
  wipeBuffer(result.stderr);
  const status = String(parsed.status ?? "unauthenticated");
  let state = "unauthenticated";
  if (status === "unlocked") state = "unlocked";
  else if (status === "locked") state = "locked";
  else if (status === "unauthenticated") state = "unauthenticated";
  return {
    installed: true,
    serverUrl: parsed.serverUrl ?? null,
    state,
    userEmail: parsed.userEmail ?? null
  };
}

// packages/bitwarden/src/login-launch.ts
var SIGNIN_BANNER = "=== Bitwarden sign-in (cursor-vault-plugins) ===";

// packages/bitwarden/src/session.ts
import fs4 from "node:fs";

// packages/core/src/credentials.ts
import fs3 from "node:fs";
var SERVICE = "bitwarden-cursor-plugin";
function fileSecretPath(account) {
  const safe = account.replace(/[^A-Za-z0-9._-]/g, "_");
  return secretPluginsPath(`${safe}.secret`);
}
function readFileSecret(account) {
  try {
    const value = fs3.readFileSync(fileSecretPath(account), "utf8");
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
function deleteFileSecret(account) {
  try {
    fs3.unlinkSync(fileSecretPath(account));
  } catch {
  }
}
async function getSecret(account) {
  if (process.env[account]) return process.env[account] ?? null;
  if (process.platform === "darwin") {
    const result = await spawnCapture("security", ["find-generic-password", "-s", SERVICE, "-a", account, "-w"]);
    if (result.code === 0) {
      const value = result.stdout.toString("utf8").replace(/\n$/, "");
      result.stdout.fill(0);
      return value || null;
    }
  }
  if (process.platform === "linux") {
    const result = await spawnCapture("secret-tool", ["lookup", "service", SERVICE, "account", account]);
    if (result.code === 0) {
      const value = result.stdout.toString("utf8").replace(/\n$/, "");
      result.stdout.fill(0);
      return value || null;
    }
  }
  return readFileSecret(account);
}
async function deleteSecret(account) {
  if (process.platform === "darwin") {
    await spawnCapture("security", ["delete-generic-password", "-s", SERVICE, "-a", account]);
  } else if (process.platform === "linux") {
    await spawnCapture("secret-tool", ["clear", "service", SERVICE, "account", account]);
  }
  deleteFileSecret(account);
}

// packages/bitwarden/src/session.ts
var SESSION_ACCOUNT = "BW_SESSION";
function statePath() {
  return secretPluginsPath("bitwarden-state.json");
}
function nowMs(clock) {
  return clock ? clock() : Date.now();
}
function isIdleExpired(lastUsedAt2, autolockMinutes, clock) {
  return nowMs(clock) - lastUsedAt2 > autolockMinutes * 6e4;
}
function lastUsedAt() {
  return readJsonFile(statePath(), { lastUsedAt: 0 }).lastUsedAt;
}
async function lockVault() {
  await bwRaw(["lock"]);
  await deleteSecret(SESSION_ACCOUNT);
  try {
    fs4.unlinkSync(statePath());
  } catch {
  }
}
async function effectiveStatus(clock) {
  const autolockMinutes = readAutolockMinutes();
  const session = await getSecret(SESSION_ACCOUNT);
  if (session && isIdleExpired(lastUsedAt(), autolockMinutes, clock)) {
    await lockVault();
  }
  const live = await readStatus(session && !isIdleExpired(lastUsedAt(), autolockMinutes, clock) ? session : null);
  const pluginRoot = process.env.CURSOR_PLUGIN_ROOT ?? "";
  const loginCommand = pluginRoot ? `${pluginRoot}/bin/bw-login` : "bw-login";
  return {
    installed: live.installed,
    serverUrl: live.serverUrl,
    state: live.state === "missing-cli" ? "missing-cli" : live.state,
    autolockMinutes,
    loginCommand
  };
}

// packages/bitwarden/src/hooks/shell-guard.ts
var BW_LEAK = /\bbw(\.exe)?\s+(get\s+(password|totp|notes|item)|list\s+items|export|unlock\b|login\b)/i;
var READ_CMDS = /\b(cat|head|tail|less|more|grep|rg|sed|awk|source|\.|base64|cp|type|Get-Content)\b/i;
var ENV_DUMP = /\b(env|printenv|export\s+-p)\b/;
var PBPASTE = /\bpbpaste\b/;
var TERMINALS_DIR = /[\\/]\.cursor[\\/]projects[\\/].*[\\/]terminals[\\/]/i;
function commandOf(input2) {
  if (typeof input2.command === "string") return input2.command;
  const tool = input2.tool_input;
  return tool?.command ?? "";
}
function deny(agent, user) {
  writeHookDecision({
    permission: "deny",
    agent_message: agent,
    user_message: user ?? agent
  });
}
function allow(extra) {
  writeHookDecision({ permission: "allow", ...extra });
}
var input = await readStdinJson();
try {
  const command = commandOf(input);
  const roots = workspaceRootsFrom(input);
  const root = roots[0] ?? process.cwd();
  const config = loadProjectConfig(root);
  if (BW_LEAK.test(command)) {
    deny(
      "Do not use the Bitwarden CLI to read secrets. Call find_logins for names, or place_in_dotenv / copy_to_clipboard / pipe_to_command / render_template to place a value."
    );
    process.exit(0);
  }
  if (TERMINALS_DIR.test(command) || command.includes(SIGNIN_BANNER)) {
    deny("Do not read Cursor terminal transcripts during Bitwarden sign-in.");
    process.exit(0);
  }
  if (PBPASTE.test(command)) {
    deny("Do not read the clipboard. If a secret was copied, it is for the user to paste.");
    process.exit(0);
  }
  const guarded = [
    ...(config.env_files ?? []).map((p) => path5.resolve(root, p)),
    ...placedPaths(root)
  ];
  if (READ_CMDS.test(command)) {
    const touchesGuarded = guarded.some((p) => command.includes(p) || command.includes(path5.relative(root, p)));
    const touchesEnv = /\.env(\.|$|\s|"|')/.test(command) && !isEnvException(command);
    if (touchesGuarded || touchesEnv || looksLikeEnvFile(command)) {
      deny("Do not read secret destination files. Use find_logins or list_placements for metadata.");
      process.exit(0);
    }
  }
  if (ENV_DUMP.test(command) && /secret-run/.test(command)) {
    deny("Do not dump the environment inside secret-run.");
    process.exit(0);
  }
  const wraps = config.wrap_commands ?? [];
  const matched = wraps.find((prefix) => command.trimStart().startsWith(prefix));
  if (matched && !command.includes("secret-run")) {
    const st = await effectiveStatus();
    if (st.state === "locked" || st.state === "unauthenticated") {
      deny(
        st.state === "unauthenticated" ? "Bitwarden is not logged in. Call login, then wait_for_signin." : "Bitwarden vault is locked. Call unlock first."
      );
      process.exit(0);
    }
    const pluginRoot = process.env.CURSOR_PLUGIN_ROOT ?? path5.resolve(root);
    const wrapped = `${pluginRoot}/bin/secret-run -- ${command}`;
    if (defaultWrapMode(config) === "suggest") {
      deny(`Run this command through secret-run: ${wrapped}`);
      process.exit(0);
    }
    allow({ updated_input: { command: wrapped } });
    process.exit(0);
  }
  allow();
} catch {
  allow();
}
process.exit(0);
