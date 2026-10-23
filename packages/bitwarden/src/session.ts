import fs from "node:fs";
import { deleteSecret, getSecret, setSecret } from "../../core/src/credentials.ts";
import { readAutolockMinutes } from "../../core/src/config.ts";
import { readJsonFile, secretPluginsPath, writeJsonFile } from "../../core/src/home.ts";
import { bwRaw, publicBwError, readStatus } from "./bw-cli.ts";
import { wipeBuffer } from "../../core/src/spawn.ts";

const SESSION_ACCOUNT = "BW_SESSION";

type IdleState = { lastUsedAt: number };

function statePath(): string {
  return secretPluginsPath("bitwarden-state.json");
}

export function nowMs(clock?: () => number): number {
  return clock ? clock() : Date.now();
}

export function isIdleExpired(lastUsedAt: number, autolockMinutes: number, clock?: () => number): boolean {
  return nowMs(clock) - lastUsedAt > autolockMinutes * 60_000;
}

export function touchLastUsed(clock?: () => number): void {
  writeJsonFile(statePath(), { lastUsedAt: nowMs(clock) } satisfies IdleState);
}

export function lastUsedAt(): number {
  return readJsonFile<IdleState>(statePath(), { lastUsedAt: 0 }).lastUsedAt;
}

export async function loadSession(clock?: () => number): Promise<string | null> {
  const session = await getSecret(SESSION_ACCOUNT);
  if (!session) return null;
  const used = lastUsedAt();
  if (used === 0) {
    touchLastUsed(clock);
    return session;
  }
  if (isIdleExpired(used, readAutolockMinutes(), clock)) {
    await lockVault();
    return null;
  }
  return session;
}

export async function storeSession(session: string, clock?: () => number): Promise<void> {
  await setSecret(SESSION_ACCOUNT, session);
  touchLastUsed(clock);
}

export async function lockVault(): Promise<void> {
  await bwRaw(["lock"]);
  await deleteSecret(SESSION_ACCOUNT);
  try {
    fs.unlinkSync(statePath());
  } catch {
    /* ignore */
  }
}

export async function effectiveStatus(clock?: () => number): Promise<{
  installed: boolean;
  serverUrl: string | null;
  state: "unauthenticated" | "locked" | "unlocked" | "missing-cli";
  autolockMinutes: number;
  loginCommand: string;
}> {
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
    loginCommand,
  };
}

export async function unlockWithPasswordFile(password: string): Promise<void> {
  const tmp = secretPluginsPath(`unlock-${process.pid}.tmp`);
  fs.writeFileSync(tmp, password, { mode: 0o600 });
  try {
    const result = await bwRaw(["unlock", "--raw", "--passwordfile", tmp]);
    if (result.code !== 0) {
      wipeBuffer(result.stdout);
      throw new Error(publicBwError(result.stderr.toString("utf8"), result.code));
    }
    const session = result.stdout.toString("utf8").trim();
    wipeBuffer(result.stdout);
    await storeSession(session);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
