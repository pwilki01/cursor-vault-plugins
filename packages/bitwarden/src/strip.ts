export const LOGIN_TYPE = 1;

export type LoginMetadata = {
  id: string;
  name: string;
  username: string | null;
  uriHosts: string[];
  folder: string;
  revisionDate: string | null;
  type: number;
};

export function hostFromUri(uri: string | undefined | null): string | null {
  if (!uri) return null;
  try {
    const withScheme = uri.includes("://") ? uri : `https://${uri}`;
    const parsed = new URL(withScheme);
    return parsed.hostname || uri;
  } catch {
    return uri;
  }
}

function uriList(item: Record<string, unknown>): string[] {
  const login = item.login as { uris?: unknown } | undefined;
  const uris = login?.uris;
  if (!Array.isArray(uris)) return [];
  return uris
    .map((entry) => {
      if (typeof entry === "string") return hostFromUri(entry);
      if (entry && typeof entry === "object" && "uri" in entry) {
        return hostFromUri(String((entry as { uri?: unknown }).uri ?? ""));
      }
      return null;
    })
    .filter((h): h is string => Boolean(h));
}

export function toLoginMetadata(item: Record<string, unknown>, folderName: string): LoginMetadata {
  const login = (item.login as { username?: unknown } | undefined) ?? {};
  const usernameRaw = login.username;
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? ""),
    username: usernameRaw == null || usernameRaw === "" ? null : String(usernameRaw),
    uriHosts: uriList(item),
    folder: folderName || "",
    revisionDate: item.revisionDate == null ? null : String(item.revisionDate),
    type: Number(item.type ?? 0),
  };
}

export function folderMap(folders: Array<{ id?: string; name?: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const folder of folders) {
    if (folder.id) map.set(folder.id, folder.name ?? "");
  }
  return map;
}

/**
 * Copy allowlisted fields and drop the source array so later error handlers
 * cannot stringify passwords, TOTP, notes, fields, or history.
 */
export function stripItems(items: unknown, folders: Map<string, string>): LoginMetadata[] {
  if (!Array.isArray(items)) return [];
  const result: LoginMetadata[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && typeof item === "object") {
      result.push(toLoginMetadata(item as Record<string, unknown>, folders.get(String((item as { folderId?: unknown }).folderId ?? "")) ?? ""));
    }
    items[i] = null;
  }
  items.length = 0;
  return result;
}

export function parseJsonAndWipe(buf: Buffer): unknown {
  const text = buf.toString("utf8");
  buf.fill(0);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Bitwarden CLI returned invalid JSON.");
  }
}

export function extractSecretFromItem(item: Record<string, unknown>, field: string): string {
  if (field === "password") {
    const value = (item.login as { password?: unknown } | undefined)?.password;
    if (typeof value === "string") return value;
    throw new Error("Login has no password field.");
  }
  if (field === "username") {
    const value = (item.login as { username?: unknown } | undefined)?.username;
    if (typeof value === "string") return value;
    throw new Error("Login has no username field.");
  }
  if (field === "totp") {
    const value = (item.login as { totp?: unknown } | undefined)?.totp;
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
      const found = fields.find((f) => f && typeof f === "object" && String((f as { name?: unknown }).name) === name);
      if (found && typeof (found as { value?: unknown }).value === "string") {
        return String((found as { value: string }).value);
      }
    }
    throw new Error("Custom field not found.");
  }
  throw new Error("Unsupported field.");
}
