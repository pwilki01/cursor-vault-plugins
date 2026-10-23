import { spawnCapture } from "../../core/src/spawn.ts";
import { wipeBuffer } from "../../core/src/spawn.ts";

export async function promptMasterPassword(): Promise<string> {
  if (process.platform === "darwin") {
    const script = `Tell application "System Events" to display dialog "Unlock Bitwarden for Cursor" default answer "" with hidden answer with title "Bitwarden"`;
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
      ["zenity", ["--password", "--title=Unlock Bitwarden"]],
      ["kdialog", ["--password", "Unlock Bitwarden"]],
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
