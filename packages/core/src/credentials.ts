import fs from "node:fs";
import { secretPluginsPath } from "./home.ts";
import { spawnCapture } from "./spawn.ts";

const SERVICE = "bitwarden-cursor-plugin";

export function fileSecretPath(account: string): string {
  const safe = account.replace(/[^A-Za-z0-9._-]/g, "_");
  return secretPluginsPath(`${safe}.secret`);
}

export function readFileSecret(account: string): string | null {
  try {
    const value = fs.readFileSync(fileSecretPath(account), "utf8");
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeFileSecret(account: string, value: string): void {
  fs.writeFileSync(fileSecretPath(account), value, { mode: 0o600 });
}

export function deleteFileSecret(account: string): void {
  try {
    fs.unlinkSync(fileSecretPath(account));
  } catch {
    /* already gone */
  }
}

export async function getSecret(account: string): Promise<string | null> {
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

export async function setSecret(account: string, value: string): Promise<void> {
  if (process.platform === "darwin") {
    await spawnCapture("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", value]);
    return;
  }
  if (process.platform === "linux") {
    await spawnCapture("secret-tool", ["store", "--label", `${SERVICE} ${account}`, "service", SERVICE, "account", account], {
      stdin: value,
    });
    return;
  }
  writeFileSecret(account, value);
}

export async function deleteSecret(account: string): Promise<void> {
  if (process.platform === "darwin") {
    await spawnCapture("security", ["delete-generic-password", "-s", SERVICE, "-a", account]);
  } else if (process.platform === "linux") {
    await spawnCapture("secret-tool", ["clear", "service", SERVICE, "account", account]);
  }
  deleteFileSecret(account);
}
