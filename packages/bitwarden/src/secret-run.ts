import { spawn } from "node:child_process";
import { loadProjectConfig } from "../../core/src/config.ts";
import { parseRef } from "../../core/src/refs.ts";
import { StreamMasker } from "../../core/src/masker.ts";
import { findPluginByScheme } from "../../core/src/registry.ts";
import { getSecretValue } from "../../azure-key-vault/src/provider.ts";
import { loadSession, touchLastUsed } from "./session.ts";
import { resolveItemField } from "./bw-cli.ts";

function parseArgs(argv: string[]): { extraEnv: Record<string, string>; cmd: string[] } {
  const extraEnv: Record<string, string> = {};
  const cmd: string[] = [];
  let seenSep = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (seenSep) {
      cmd.push(a);
      continue;
    }
    if (a === "--") {
      seenSep = true;
      continue;
    }
    if (a === "--env" && argv[i + 1]) {
      const [k, ...rest] = argv[++i].split("=");
      extraEnv[k] = rest.join("=");
      continue;
    }
    cmd.push(a);
    seenSep = true;
  }
  return { extraEnv, cmd };
}

const { extraEnv, cmd } = parseArgs(process.argv.slice(2));
if (cmd.length === 0) {
  process.stderr.write("usage: secret-run [--env KEY=bw://item] -- <command>\n");
  process.exit(2);
}

const root = process.cwd();
const config = loadProjectConfig(root);
const mapping = { ...(config.env ?? {}), ...extraEnv };
const parsed = Object.entries(mapping).map(([key, refStr]) => ({ key, ref: parseRef(refStr) }));
const needsBw = parsed.some((p) => p.ref.scheme === "bw");
const needsAkv = parsed.some((p) => p.ref.scheme === "akv");

let session: string | null = null;
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

const secrets: string[] = [];
const env = { ...process.env };
for (const { key, ref } of parsed) {
  let value: string;
  if (ref.scheme === "bw") {
    value = await resolveItemField(session as string, ref.item, ref.field);
  } else {
    value = await getSecretValue(ref.vault, ref.secret, ref.version);
  }
  env[key] = value;
  secrets.push(value);
}

const child = spawn(cmd[0], cmd.slice(1), { env, stdio: ["inherit", "pipe", "pipe"] });
const outMask = new StreamMasker(secrets);
const errMask = new StreamMasker(secrets);
child.stdout.on("data", (d: Buffer) => process.stdout.write(outMask.push(d.toString("utf8"))));
child.stderr.on("data", (d: Buffer) => process.stderr.write(errMask.push(d.toString("utf8"))));
child.on("close", (code) => {
  process.stdout.write(outMask.flush());
  process.stderr.write(errMask.flush());
  process.exit(code ?? 1);
});
