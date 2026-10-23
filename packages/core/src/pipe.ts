import { spawnCapture } from "./spawn.ts";
import { maskText } from "./masker.ts";

export type Argv = string[];

const BUILTIN: Argv[] = [
  ["docker", "login", "--password-stdin"],
  ["podman", "login", "--password-stdin"],
  ["helm", "registry", "login"],
  ["gh", "secret", "set"],
  ["kubectl", "create", "secret", "generic"],
  ["dotnet", "user-secrets", "set"],
  ["vercel", "env", "add"],
  ["wrangler", "secret", "put"],
  ["az", "keyvault", "secret", "set"],
];

export function argvMatches(argv: Argv, pattern: Argv): boolean {
  if (argv.length < pattern.length) return false;
  return pattern.every((part, i) => argv[i] === part);
}

export function isAllowlisted(argv: Argv, extra: Argv[] = []): boolean {
  if (argv.length === 0) return false;
  const base = argv[0].split(/[\\/]/).pop() ?? argv[0];
  const normalized = [base, ...argv.slice(1)];
  return [...BUILTIN, ...extra].some((pattern) => argvMatches(normalized, pattern) || argvMatches(argv, pattern));
}

export async function pipeToCommand(
  argv: Argv,
  value: string,
  cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  if (argv.length === 0) throw new Error("Command argv must not be empty.");
  const result = await spawnCapture(argv[0], argv.slice(1), { cwd, stdin: value });
  const stdout = maskText(result.stdout.toString("utf8"), [value]);
  const stderr = maskText(result.stderr.toString("utf8"), [value]);
  wipeMaybe(result.stdout);
  wipeMaybe(result.stderr);
  return { code: result.code, stdout, stderr };
}

function wipeMaybe(buf: Buffer): void {
  buf.fill(0);
}
