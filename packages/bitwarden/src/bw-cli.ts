import { spawnCapture, wipeBuffer } from "../../core/src/spawn.ts";
import { folderMap, parseJsonAndWipe, stripItems, extractSecretFromItem, type LoginMetadata } from "./strip.ts";

export type BwStatus = {
  installed: boolean;
  serverUrl: string | null;
  state: "unauthenticated" | "locked" | "unlocked" | "missing-cli";
  userEmail?: string | null;
};

export function bwCommand(): string {
  return process.env.BW_CLI_PATH || "bw";
}

export async function bwRaw(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<{ code: number | null; stdout: Buffer; stderr: Buffer }> {
  try {
    const command = bwCommand();
    if (command.endsWith(".mjs") || command.endsWith(".js") || command.endsWith(".ts")) {
      return await spawnCapture(process.execPath, [command, ...args], { env, timeoutMs: 60_000 });
    }
    return await spawnCapture(command, args, { env, timeoutMs: 60_000 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const empty = Buffer.alloc(0);
      return { code: 127, stdout: empty, stderr: Buffer.from("bw CLI is not installed") };
    }
    throw err;
  }
}

export async function bwJson(args: string[], session?: string | null): Promise<unknown> {
  const env = { ...process.env };
  if (session) env.BW_SESSION = session;
  const result = await bwRaw(args, env);
  const stderr = result.stderr.toString("utf8");
  wipeBuffer(result.stderr);
  if (result.code !== 0) {
    wipeBuffer(result.stdout);
    throw new Error(publicBwError(stderr, result.code));
  }
  if (result.stdout.length === 0) return null;
  return parseJsonAndWipe(result.stdout);
}

export function publicBwError(stderr: string, code: number | null): string {
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

export async function readStatus(session?: string | null): Promise<BwStatus> {
  const env = { ...process.env };
  if (session) env.BW_SESSION = session;
  const result = await bwRaw(["status"], env);
  if (result.code === 127) {
    return { installed: false, serverUrl: null, state: "missing-cli" };
  }
  let parsed: { status?: string; serverUrl?: string; userEmail?: string } = {};
  try {
    parsed = (parseJsonAndWipe(result.stdout) as typeof parsed) ?? {};
  } catch {
    wipeBuffer(result.stdout);
  }
  wipeBuffer(result.stderr);
  const status = String(parsed.status ?? "unauthenticated");
  let state: BwStatus["state"] = "unauthenticated";
  if (status === "unlocked") state = "unlocked";
  else if (status === "locked") state = "locked";
  else if (status === "unauthenticated") state = "unauthenticated";
  return {
    installed: true,
    serverUrl: parsed.serverUrl ?? null,
    state,
    userEmail: parsed.userEmail ?? null,
  };
}

export async function listLoginMetadata(session: string): Promise<LoginMetadata[]> {
  const foldersRaw = await bwJson(["list", "folders"], session);
  const itemsRaw = await bwJson(["list", "items"], session);
  const folders = folderMap(Array.isArray(foldersRaw) ? (foldersRaw as Array<{ id?: string; name?: string }>) : []);
  const metadata = stripItems(itemsRaw, folders);
  if (Array.isArray(foldersRaw)) foldersRaw.length = 0;
  return metadata;
}

export async function resolveItemField(session: string, item: string, field: string): Promise<string> {
  const raw = await bwJson(["get", "item", item], session);
  if (!raw || typeof raw !== "object") throw new Error("Bitwarden item not found.");
  try {
    return extractSecretFromItem(raw as Record<string, unknown>, field);
  } finally {
    for (const key of Object.keys(raw as object)) {
      (raw as Record<string, unknown>)[key] = null;
    }
  }
}
