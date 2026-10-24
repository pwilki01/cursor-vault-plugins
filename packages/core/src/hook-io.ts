import { stdin } from "node:process";

export async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

export async function readStdinJson<T = Record<string, unknown>>(): Promise<T> {
  const raw = await readStdinText();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function commandFrom(input: Record<string, unknown>): string {
  if (typeof input.command === "string") return input.command;
  const tool = input.tool_input as { command?: unknown } | undefined;
  return typeof tool?.command === "string" ? tool.command : "";
}

export function writeHookDecision(decision: {
  permission: "allow" | "deny" | "ask";
  agent_message?: string;
  user_message?: string;
  updated_input?: Record<string, unknown>;
}): void {
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

export function workspaceRootsFrom(input: Record<string, unknown>): string[] {
  const roots = input.workspace_roots;
  if (Array.isArray(roots)) return roots.map(String);
  const cwd = input.cwd ?? (input.tool_input as { working_directory?: string } | undefined)?.working_directory;
  return cwd ? [String(cwd)] : [];
}
