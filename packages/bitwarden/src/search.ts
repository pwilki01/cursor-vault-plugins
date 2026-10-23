import { LOGIN_TYPE, type LoginMetadata } from "./strip.ts";

export function tokenize(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

export function itemHaystack(item: LoginMetadata): string {
  return [item.name, item.username ?? "", ...item.uriHosts, item.folder].join(" ").toLowerCase();
}

export function matchLogins(
  items: LoginMetadata[],
  query: string,
  options: { includeNonLogins?: boolean } = {},
): LoginMetadata[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const pool = options.includeNonLogins ? items : items.filter((item) => item.type === LOGIN_TYPE);
  return pool.filter((item) => {
    const haystack = itemHaystack(item);
    return tokens.every((token) => haystack.includes(token));
  });
}

export type FindLoginsResult = {
  query: string;
  count: number;
  matches: Array<{
    id: string;
    name: string;
    username: string | null;
    uriHosts: string[];
    folder: string;
    revisionDate: string | null;
  }>;
  message?: string;
};

export function toFindLoginsResult(query: string, matches: LoginMetadata[]): FindLoginsResult {
  const safe = matches.map((item) => ({
    id: item.id,
    name: item.name,
    username: item.username,
    uriHosts: item.uriHosts,
    folder: item.folder,
    revisionDate: item.revisionDate,
  }));
  const result: FindLoginsResult = {
    query,
    count: safe.length,
    matches: safe,
  };
  if (safe.length === 0) result.message = "No logins matched.";
  return result;
}
