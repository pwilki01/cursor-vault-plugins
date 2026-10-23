import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SECRET_PLUGINS_DIR = path.join(os.homedir(), ".cursor", "secret-plugins");

export function ensureSecretPluginsDir(): string {
  fs.mkdirSync(SECRET_PLUGINS_DIR, { recursive: true, mode: 0o700 });
  return SECRET_PLUGINS_DIR;
}

export function secretPluginsPath(...parts: string[]): string {
  return path.join(ensureSecretPluginsDir(), ...parts);
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath: string, value: unknown, mode = 0o600): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.renameSync(tmp, filePath);
}
