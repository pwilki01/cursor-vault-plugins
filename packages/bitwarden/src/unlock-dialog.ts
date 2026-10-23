import { spawnCapture } from "../../core/src/spawn.ts";
import { wipeBuffer } from "../../core/src/spawn.ts";

export async function promptMasterPassword(): Promise<string> {
  if (process.platform === "darwin") {
    const script =
      'tell application "System Events" to display dialog "Enter your Bitwarden master password to unlock the vault." default answer "" with hidden answer with title "Bitwarden master password" buttons {"Cancel", "Unlock"} default button "Unlock"';
    const result = await spawnCapture("osascript", ["-e", script]);
    if (result.code !== 0) throw new Error("Unlock cancelled.");
    const text = result.stdout.toString("utf8");
    wipeBuffer(result.stdout);
    const match = text.match(/text returned:(.*)$/s);
    const password = match ? match[1].trim() : "";
    if (!password) throw new Error("Unlock cancelled.");
    return password;
  }
  if (process.platform === "linux") {
    for (const [cmd, args] of [
      ["zenity", ["--password", "--title=Bitwarden master password", "--text=Enter your Bitwarden master password to unlock the vault."]],
      ["kdialog", ["--title", "Bitwarden master password", "--password", "Enter your Bitwarden master password to unlock the vault."]],
    ] as Array<[string, string[]]>) {
      const result = await spawnCapture(cmd, args);
      if (result.code === 0) {
        const password = result.stdout.toString("utf8").replace(/\n$/, "");
        wipeBuffer(result.stdout);
        if (password) return password;
      }
    }
    throw new Error("No password dialog (zenity or kdialog) is available. Run bw-unlock in a terminal.");
  }
  throw new Error("Native unlock dialog is not supported on this OS. Run bw-unlock in a terminal.");
}
