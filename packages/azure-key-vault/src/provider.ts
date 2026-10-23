import { spawnCapture, wipeBuffer } from "../../core/src/spawn.ts";
import { parseJsonAndWipe } from "../../bitwarden/src/strip.ts";
import { logEvent } from "../../core/src/logger.ts";

export type SecretMetadata = {
  name: string;
  contentType: string | null;
  tags: Record<string, string>;
  enabled: boolean | null;
  updated: string | null;
};

function tokenize(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

export function matchSecrets(items: SecretMetadata[], query: string): SecretMetadata[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return items.filter((item) => {
    const haystack = [item.name, item.contentType ?? "", ...Object.keys(item.tags), ...Object.values(item.tags)]
      .join(" ")
      .toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}

export async function listVaults(): Promise<Array<{ name: string; resourceGroup: string | null }>> {
  const result = await spawnCapture("az", ["keyvault", "list", "-o", "json"]);
  if (result.code !== 0) {
    wipeBuffer(result.stdout);
    throw new Error("az keyvault list failed. Run az login.");
  }
  const parsed = parseJsonAndWipe(result.stdout);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((v) => ({
    name: String((v as { name?: string }).name ?? ""),
    resourceGroup: ((v as { resourceGroup?: string }).resourceGroup ?? null) as string | null,
  }));
}

export async function findSecrets(vault: string, query: string): Promise<{
  query: string;
  vault: string;
  count: number;
  matches: SecretMetadata[];
  message?: string;
}> {
  const result = await spawnCapture("az", ["keyvault", "secret", "list", "--vault-name", vault, "-o", "json"]);
  if (result.code !== 0) {
    wipeBuffer(result.stdout);
    throw new Error("az keyvault secret list failed. Check vault name and Key Vault Secrets User role.");
  }
  const parsed = parseJsonAndWipe(result.stdout);
  const items: SecretMetadata[] = Array.isArray(parsed)
    ? parsed.map((raw) => {
        const s = raw as {
          name?: string;
          contentType?: string;
          tags?: Record<string, string>;
          attributes?: { enabled?: boolean; updated?: string };
        };
        return {
          name: String(s.name ?? ""),
          contentType: s.contentType ?? null,
          tags: s.tags ?? {},
          enabled: s.attributes?.enabled ?? null,
          updated: s.attributes?.updated ?? null,
        };
      })
    : [];
  if (Array.isArray(parsed)) parsed.length = 0;
  const matches = matchSecrets(items, query);
  logEvent({ event: "find_secrets", vault, query, count: matches.length });
  return {
    query,
    vault,
    count: matches.length,
    matches,
    message: matches.length === 0 ? "No secrets matched." : undefined,
  };
}

export async function getSecretValue(vault: string, name: string, version?: string): Promise<string> {
  const args = ["keyvault", "secret", "show", "--vault-name", vault, "--name", name, "-o", "json"];
  if (version) args.push("--version", version);
  const result = await spawnCapture("az", args);
  if (result.code !== 0) {
    wipeBuffer(result.stdout);
    throw new Error("Failed to read Key Vault secret.");
  }
  const parsed = parseJsonAndWipe(result.stdout) as { value?: string };
  const value = parsed?.value;
  if (typeof parsed === "object" && parsed) {
    for (const key of Object.keys(parsed)) (parsed as Record<string, unknown>)[key] = null;
  }
  if (typeof value !== "string") throw new Error("Secret has no value.");
  return value;
}

export async function status(): Promise<{ credential: string; reachable: boolean; message?: string }> {
  const account = await spawnCapture("az", ["account", "show", "-o", "json"]);
  if (account.code !== 0) {
    wipeBuffer(account.stdout);
    return { credential: "none", reachable: false, message: "Run az login." };
  }
  wipeBuffer(account.stdout);
  return { credential: "az-cli", reachable: true };
}
