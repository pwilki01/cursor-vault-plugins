#!/usr/bin/env node
import { spawn } from "node:child_process";
import { bwCommand } from "./bw-cli.ts";
import { storeSession } from "./session.ts";

process.stdout.write("Unlock Bitwarden. The session key will be stored in the OS keychain, not printed.\n");
const child = spawn(bwCommand(), ["unlock", "--raw"], { stdio: ["inherit", "pipe", "inherit"] });
let session = "";
child.stdout.on("data", (d: Buffer) => {
  session += d.toString("utf8");
  d.fill(0);
});
const code: number = await new Promise((resolve) => child.on("close", (c) => resolve(c ?? 1)));
if (code !== 0) process.exit(code);
await storeSession(session.trim());
process.stdout.write("Unlocked.\n");
