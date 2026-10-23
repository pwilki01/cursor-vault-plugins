import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loginNoncePath, writeLoginNonce, extensionAckPath, findPluginByScheme } from "../../core/src/registry.ts";
import { spawnCapture } from "../../core/src/spawn.ts";
import { bwCommand, readStatus } from "./bw-cli.ts";

export const SIGNIN_BANNER = "=== Bitwarden sign-in (cursor-vault-plugins) ===";

export function pluginBinLogin(): string {
  const registered = findPluginByScheme("bw");
  if (registered?.loginHelper && fs.existsSync(registered.loginHelper)) return registered.loginHelper;
  const root = process.env.CURSOR_PLUGIN_ROOT;
  if (root) return path.join(root, "bin", "bw-login");
  return path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..", "plugins", "bitwarden", "bin", "bw-login");
}

export async function startLogin(): Promise<{
  status: "window_opened" | "extension_opened" | "manual";
  message: string;
  loginCommand: string;
}> {
  const loginCommand = pluginBinLogin();
  const nonce = randomBytes(16).toString("hex");
  writeLoginNonce(nonce);
  try {
    fs.unlinkSync(extensionAckPath());
  } catch {
    /* none */
  }

  const uri = `cursor://cursor-vault-plugins.bitwarden-signin/login?nonce=${nonce}`;
  await openUri(uri);
  const ack = await waitForAck(5000);
  if (ack) {
    return {
      status: "extension_opened",
      message: "Finish signing in in the Cursor terminal named Bitwarden sign-in, then wait.",
      loginCommand,
    };
  }

  const opened = await openExternalTerminal(loginCommand);
  if (opened) {
    return {
      status: "window_opened",
      message: "Finish signing in in the terminal window that just opened, then wait.",
      loginCommand,
    };
  }

  return {
    status: "manual",
    message: `Could not open a terminal. Run this yourself: ${loginCommand}`,
    loginCommand,
  };
}

async function openUri(uri: string): Promise<void> {
  try {
    if (process.platform === "darwin") await spawnCapture("open", [uri]);
    else if (process.platform === "win32") await spawnCapture("cmd", ["/c", "start", "", uri]);
    else await spawnCapture("xdg-open", [uri]);
  } catch {
    /* extension may be absent */
  }
}

async function waitForAck(ms: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fs.existsSync(extensionAckPath())) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export async function openExternalTerminal(loginCommand: string): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      const script = `tell application "Terminal" to do script ${JSON.stringify(loginCommand)}`;
      const result = await spawnCapture("osascript", ["-e", script]);
      return result.code === 0;
    }
    if (process.platform === "win32") {
      const result = await spawnCapture("cmd", ["/c", "start", "cmd", "/k", loginCommand]);
      return result.code === 0;
    }
    for (const [cmd, args] of [
      ["x-terminal-emulator", ["-e", loginCommand]],
      ["gnome-terminal", ["--", loginCommand]],
      ["konsole", ["-e", loginCommand]],
    ] as Array<[string, string[]]>) {
      const result = await spawnCapture(cmd, args);
      if (result.code === 0) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function waitForSignin(timeoutMs = 45_000): Promise<{
  status: "signed_in" | "waiting" | "unauthenticated";
  state: string;
}> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = await readStatus();
    if (st.state === "unlocked" || st.state === "locked") {
      return { status: "signed_in", state: st.state };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const st = await readStatus();
  return { status: st.state === "unauthenticated" ? "waiting" : "signed_in", state: st.state };
}

export function loginNonceFile(): string {
  return loginNoncePath();
}

export function homedir(): string {
  return os.homedir();
}

export { bwCommand };
