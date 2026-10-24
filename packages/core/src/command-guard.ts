import path from "node:path";

// String matching stops accidental and casual leaks, not a determined agent
// (encoded payloads, scripts written in one step and run in the next).

export function normalizeCommand(command: string): string {
  return command
    .replace(/\\\r?\n/g, "")
    .replace(/\$\{(\w+)\}/g, "$$$1")
    .replace(/['"`\\]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

const BW_WORD = /(?<![\w.-])bw(\.exe)?(?![\w.-])/;
const BW_SENSITIVE =
  /\b(get (password|totp|notes|item|attachment|exposed)|list items|export|unlock|login|serve|send|receive)\b|(^|\s)--session\b/;
const BW_ENV = /\bbw_(session|password|clientsecret)\b/;
const BW_STORAGE = /bitwarden-cursor-plugin|secret-plugins|bitwarden cli|dump-keychain|secret-tool (lookup|search)/;

export function bitwardenLeak(command: string): string | null {
  const n = normalizeCommand(command);
  if (BW_ENV.test(n)) return "session-env";
  if (BW_STORAGE.test(n)) return "session-storage";
  if (BW_WORD.test(n) && BW_SENSITIVE.test(n)) return "bw-cli";
  return null;
}

const AZ_WORD = /(?<![\w.-])az(\.cmd|\.exe)?(?![\w.-])/;

export function azureLeak(command: string): string | null {
  const n = normalizeCommand(command);
  if (n.includes("vault.azure.net")) return "data-plane";
  if (/\bget-access-token\b/.test(n) && /vault/.test(n)) return "vault-token";
  if (AZ_WORD.test(n) && /\bkeyvault\b/.test(n) && /\bsecret\b/.test(n) && /\b(show|download|backup)\b/.test(n)) {
    return "az-cli";
  }
  return null;
}

const VAULT_RELATED = /\bbw\b|bitwarden|bw_session|secret-plugins|keyvault|vault\.azure/i;

export function looksVaultRelated(text: string): boolean {
  return VAULT_RELATED.test(text) || VAULT_RELATED.test(normalizeCommand(text));
}

export function isVaultStatePath(filePath: string): boolean {
  if (!filePath) return false;
  const p = path.resolve(filePath).split(path.sep).join("/").toLowerCase();
  return p.includes("/.cursor/secret-plugins/") || p.endsWith("/.cursor/secret-plugins") || p.includes("/bitwarden cli/");
}
