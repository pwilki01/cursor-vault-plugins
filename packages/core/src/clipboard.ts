import { spawnCapture } from "./spawn.ts";
import { createHash } from "node:crypto";

export function hashValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function copyToClipboard(value: string): Promise<string> {
  const plat = process.platform;
  if (plat === "darwin") {
    const result = await spawnCapture("pbcopy", [], { stdin: value });
    if (result.code !== 0) throw new Error("pbcopy failed");
    return "pbcopy";
  }
  if (plat === "win32") {
    const result = await spawnCapture("clip.exe", [], { stdin: value });
    if (result.code !== 0) throw new Error("clip.exe failed");
    return "clip.exe";
  }
  const wl = await spawnCapture("wl-copy", [], { stdin: value });
  if (wl.code === 0) return "wl-copy";
  const xclip = await spawnCapture("xclip", ["-selection", "clipboard"], { stdin: value });
  if (xclip.code === 0) return "xclip";
  throw new Error("No clipboard tool found (wl-copy or xclip).");
}

export async function readClipboard(): Promise<string | null> {
  const plat = process.platform;
  if (plat === "darwin") {
    const result = await spawnCapture("pbpaste", []);
    return result.code === 0 ? result.stdout.toString("utf8") : null;
  }
  if (plat === "win32") return null;
  const wl = await spawnCapture("wl-paste", ["-n"]);
  if (wl.code === 0) return wl.stdout.toString("utf8");
  const xclip = await spawnCapture("xclip", ["-selection", "clipboard", "-o"]);
  if (xclip.code === 0) return xclip.stdout.toString("utf8");
  return null;
}

export async function clearClipboardIfHash(expectedHash: string): Promise<boolean> {
  const current = await readClipboard();
  if (current == null) return false;
  if (hashValue(current) !== expectedHash) return false;
  await copyToClipboard("");
  return true;
}
