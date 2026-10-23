import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// packages/bitwarden/src/secret-run.ts
import { spawn as spawn2 } from "node:child_process";

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
function writeJsonFile(filePath, value, mode = 384) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 448 });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}
`, { mode });
  fs.renameSync(tmp, filePath);
}

// packages/core/src/config.ts
function loadProjectConfig(workspaceRoot) {
  return readJsonFile(path2.join(workspaceRoot, ".cursor", "secrets.json"), {});
}
function readAutolockMinutes() {
  const homeConfig = path2.join(process.env.HOME ?? "", ".cursor", "secret-plugins", "config.json");
  try {
    const parsed2 = JSON.parse(fs2.readFileSync(homeConfig, "utf8"));
    if (typeof parsed2.autolock_minutes === "number" && parsed2.autolock_minutes > 0) {
      return parsed2.autolock_minutes;
    }
  } catch {
  }
  return 60;
}

// packages/core/src/refs.ts
var BW_RE = /^bw:\/\/([^/]+)(?:\/(.+))?$/i;
var AKV_RE = /^akv:\/\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/i;
function parseRef(input) {
  const trimmed = input.trim();
  const bw = trimmed.match(BW_RE);
  if (bw) {
    const fieldRaw = bw[2] ?? "password";
    const field = normalizeBwField(fieldRaw);
    return { scheme: "bw", item: decodeURIComponent(bw[1]), field };
  }
  const akv = trimmed.match(AKV_RE);
  if (akv) {
    return {
      scheme: "akv",
      vault: decodeURIComponent(akv[1]),
      secret: decodeURIComponent(akv[2]),
      version: akv[3] ? decodeURIComponent(akv[3]) : void 0
    };
  }
  throw new Error("Unrecognized secret reference. Use bw://<item>[/<field>] or akv://<vault>/<secret>[/<version>].");
}
function normalizeBwField(field) {
  const lower = field.toLowerCase();
  if (lower === "password" || lower === "username" || lower === "totp" || lower === "notes") {
    return lower;
  }
  if (lower.startsWith("field:")) {
    return `field:${field.slice("field:".length)}`;
  }
  throw new Error("Unsupported Bitwarden field. Use password, username, totp, notes, or field:<name>.");
}

// packages/core/src/masker.ts
import { Buffer as Buffer2 } from "node:buffer";
var MASK = "********";
function encodingsOf(secret) {
  if (!secret) return [];
  const values = /* @__PURE__ */ new Set([secret]);
  try {
    values.add(encodeURIComponent(secret));
  } catch {
  }
  values.add(Buffer2.from(secret, "utf8").toString("base64"));
  return [...values].filter((v) => v.length > 0);
}
function maskText(text, secrets2) {
  let out = text;
  const needles = secrets2.flatMap(encodingsOf).sort((a, b) => b.length - a.length);
  for (const needle of needles) {
    if (!needle) continue;
    out = out.split(needle).join(MASK);
  }
  return out;
}
var StreamMasker = class {
  carry = "";
  maxCarry;
  secrets;
  constructor(secrets2) {
    this.secrets = secrets2;
    this.maxCarry = Math.max(64, ...encodingsOf(secrets2.join("")).map((s) => s.length), ...secrets2.map((s) => s.length));
  }
  push(chunk) {
    const combined = this.carry + chunk;
    if (combined.length <= this.maxCarry) {
      this.carry = combined;
      return "";
    }
    const emitCount = combined.length - this.maxCarry;
    const emit = combined.slice(0, emitCount);
    this.carry = combined.slice(emitCount);
    return maskText(emit, this.secrets);
  }
  flush() {
    const rest = maskText(this.carry, this.secrets);
    this.carry = "";
    return rest;
  }
};

// packages/core/src/registry.ts
function registryPath() {
  return secretPluginsPath("registry.json");
}
function loadRegistry() {
  return readJsonFile(registryPath(), { plugins: [] }).plugins;
}
function findPluginByScheme(scheme) {
  return loadRegistry().find((p) => p.scheme === scheme);
}

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
    child2.on("close", (code) => {
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
function extractSecretFromItem(item, field) {
  if (field === "password") {
    const value = item.login?.password;
    if (typeof value === "string") return value;
    throw new Error("Login has no password field.");
  }
  if (field === "username") {
    const value = item.login?.username;
    if (typeof value === "string") return value;
    throw new Error("Login has no username field.");
  }
  if (field === "totp") {
    const value = item.login?.totp;
    if (typeof value === "string") return value;
    throw new Error("Login has no TOTP field.");
  }
  if (field === "notes") {
    if (typeof item.notes === "string") return item.notes;
    throw new Error("Item has no notes.");
  }
  if (field.startsWith("field:")) {
    const name = field.slice("field:".length);
    const fields = item.fields;
    if (Array.isArray(fields)) {
      const found = fields.find((f) => f && typeof f === "object" && String(f.name) === name);
      if (found && typeof found.value === "string") {
        return String(found.value);
      }
    }
    throw new Error("Custom field not found.");
  }
  throw new Error("Unsupported field.");
}

// packages/azure-key-vault/src/provider.ts
async function getSecretValue(vault, name, version) {
  const args = ["keyvault", "secret", "show", "--vault-name", vault, "--name", name, "-o", "json"];
  if (version) args.push("--version", version);
  const result = await spawnCapture("az", args);
  if (result.code !== 0) {
    wipeBuffer(result.stdout);
    throw new Error("Failed to read Key Vault secret.");
  }
  const parsed2 = parseJsonAndWipe(result.stdout);
  const value = parsed2?.value;
  if (typeof parsed2 === "object" && parsed2) {
    for (const key of Object.keys(parsed2)) parsed2[key] = null;
  }
  if (typeof value !== "string") throw new Error("Secret has no value.");
  return value;
}

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

// packages/bitwarden/src/bw-cli.ts
function bwCommand() {
  return process.env.BW_CLI_PATH || "bw";
}
async function bwRaw(args, env2 = process.env) {
  try {
    const command = bwCommand();
    if (command.endsWith(".mjs") || command.endsWith(".js") || command.endsWith(".ts")) {
      return await spawnCapture(process.execPath, [command, ...args], { env: env2, timeoutMs: 6e4 });
    }
    return await spawnCapture(command, args, { env: env2, timeoutMs: 6e4 });
  } catch (err) {
    if (err.code === "ENOENT") {
      const empty = Buffer.alloc(0);
      return { code: 127, stdout: empty, stderr: Buffer.from("bw CLI is not installed") };
    }
    throw err;
  }
}
async function bwJson(args, session2) {
  const env2 = { ...process.env };
  if (session2) env2.BW_SESSION = session2;
  const result = await bwRaw(args, env2);
  const stderr = result.stderr.toString("utf8");
  wipeBuffer(result.stderr);
  if (result.code !== 0) {
    wipeBuffer(result.stdout);
    throw new Error(publicBwError(stderr, result.code));
  }
  if (result.stdout.length === 0) return null;
  return parseJsonAndWipe(result.stdout);
}
function publicBwError(stderr, code) {
  const lower = stderr.toLowerCase();
  if (lower.includes("not logged in") || lower.includes("unauthenticated")) {
    return "Bitwarden CLI is not logged in.";
  }
  if (lower.includes("vault is locked") || lower.includes("session")) {
    return "Bitwarden vault is locked.";
  }
  if (code === 127) return "Bitwarden CLI (bw) is not installed. Install with: brew install bitwarden-cli";
  return "Bitwarden CLI command failed.";
}
async function resolveItemField(session2, item, field) {
  const raw = await bwJson(["get", "item", item], session2);
  if (!raw || typeof raw !== "object") throw new Error("Bitwarden item not found.");
  try {
    return extractSecretFromItem(raw, field);
  } finally {
    for (const key of Object.keys(raw)) {
      raw[key] = null;
    }
  }
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
function touchLastUsed(clock) {
  writeJsonFile(statePath(), { lastUsedAt: nowMs(clock) });
}
function lastUsedAt() {
  return readJsonFile(statePath(), { lastUsedAt: 0 }).lastUsedAt;
}
async function loadSession(clock) {
  const session2 = await getSecret(SESSION_ACCOUNT);
  if (!session2) return null;
  const used = lastUsedAt();
  if (used === 0) {
    touchLastUsed(clock);
    return session2;
  }
  if (isIdleExpired(used, readAutolockMinutes(), clock)) {
    await lockVault();
    return null;
  }
  return session2;
}
async function lockVault() {
  await bwRaw(["lock"]);
  await deleteSecret(SESSION_ACCOUNT);
  try {
    fs4.unlinkSync(statePath());
  } catch {
  }
}

// packages/bitwarden/src/secret-run.ts
function parseArgs(argv) {
  const extraEnv2 = {};
  const cmd2 = [];
  let seenSep = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (seenSep) {
      cmd2.push(a);
      continue;
    }
    if (a === "--") {
      seenSep = true;
      continue;
    }
    if (a === "--env" && argv[i + 1]) {
      const [k, ...rest] = argv[++i].split("=");
      extraEnv2[k] = rest.join("=");
      continue;
    }
    cmd2.push(a);
    seenSep = true;
  }
  return { extraEnv: extraEnv2, cmd: cmd2 };
}
var { extraEnv, cmd } = parseArgs(process.argv.slice(2));
if (cmd.length === 0) {
  process.stderr.write("usage: secret-run [--env KEY=bw://item] -- <command>\n");
  process.exit(2);
}
var root = process.cwd();
var config = loadProjectConfig(root);
var mapping = { ...config.env ?? {}, ...extraEnv };
var parsed = Object.entries(mapping).map(([key, refStr]) => ({ key, ref: parseRef(refStr) }));
var needsBw = parsed.some((p) => p.ref.scheme === "bw");
var needsAkv = parsed.some((p) => p.ref.scheme === "akv");
var session = null;
if (needsBw) {
  session = await loadSession();
  if (!session) {
    process.stderr.write("Bitwarden vault is locked or not logged in.\n");
    process.exit(1);
  }
  touchLastUsed();
}
if (needsAkv && !findPluginByScheme("akv")) {
  process.stderr.write("Azure Key Vault plugin is not installed for akv:// refs.\n");
  process.exit(1);
}
var secrets = [];
var env = { ...process.env };
for (const { key, ref } of parsed) {
  let value;
  if (ref.scheme === "bw") {
    value = await resolveItemField(session, ref.item, ref.field);
  } else {
    value = await getSecretValue(ref.vault, ref.secret, ref.version);
  }
  env[key] = value;
  secrets.push(value);
}
var child = spawn2(cmd[0], cmd.slice(1), { env, stdio: ["inherit", "pipe", "pipe"] });
var outMask = new StreamMasker(secrets);
var errMask = new StreamMasker(secrets);
child.stdout.on("data", (d) => process.stdout.write(outMask.push(d.toString("utf8"))));
child.stderr.on("data", (d) => process.stderr.write(errMask.push(d.toString("utf8"))));
child.on("close", (code) => {
  process.stdout.write(outMask.flush());
  process.stderr.write(errMask.flush());
  process.exit(code ?? 1);
});
