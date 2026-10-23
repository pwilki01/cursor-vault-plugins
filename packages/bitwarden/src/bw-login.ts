#!/usr/bin/env node
import readline from "node:readline";
import { spawn } from "node:child_process";
import { SIGNIN_BANNER } from "./login-launch.ts";
import { bwCommand } from "./bw-cli.ts";
import { storeSession } from "./session.ts";
import { spawnCapture, wipeBuffer } from "../../core/src/spawn.ts";

function clearScreen(): void {
  process.stdout.write("\u001b[H\u001b[2J\u001b[3J");
}

function onExit(): void {
  clearScreen();
}

process.on("SIGINT", () => {
  onExit();
  process.exit(130);
});
process.on("exit", onExit);

process.stdout.write(`${SIGNIN_BANNER}\n`);
process.stdout.write("This terminal is for Bitwarden sign-in. Passwords are hidden.\n\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));
const askHidden = (q: string) =>
  new Promise<string>((resolve) => {
    process.stdout.write(q);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    let acc = "";
    const onData = (d: Buffer) => {
      const s = d.toString("utf8");
      if (s === "\n" || s === "\r") {
        stdin.setRawMode?.(wasRaw ?? false);
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(acc);
      } else if (s === "\u0003") {
        process.exit(130);
      } else if (s === "\u007f") {
        acc = acc.slice(0, -1);
      } else {
        acc += s;
      }
    };
    stdin.on("data", onData);
  });

const method = (await ask("Login method [1] email + master password  [2] API key: ")).trim() || "1";

if (method === "2") {
  const clientId = (await ask("BW client id: ")).trim();
  const clientSecret = await askHidden("BW client secret: ");
  rl.close();
  const result = await spawnCapture(bwCommand(), ["login", "--apikey"], {
    env: { ...process.env, BW_CLIENTID: clientId, BW_CLIENTSECRET: clientSecret },
  });
  if (result.code !== 0) {
    wipeBuffer(result.stdout);
    process.stderr.write("Login failed.\n");
    process.exit(result.code ?? 1);
  }
} else {
  rl.close();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bwCommand(), ["login"], { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("login failed"))));
  });
}

const unlock = spawn(bwCommand(), ["unlock", "--raw"], { stdio: ["inherit", "pipe", "inherit"] });
let session = "";
unlock.stdout.on("data", (d: Buffer) => {
  session += d.toString("utf8");
  d.fill(0);
});
const code: number = await new Promise((resolve) => unlock.on("close", (c) => resolve(c ?? 1)));
if (code !== 0) process.exit(code);
await storeSession(session.trim());
session = "";
process.stdout.write("Done\n");
process.exit(0);
