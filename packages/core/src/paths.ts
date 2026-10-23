import fs from "node:fs";
import path from "node:path";
import { spawnCapture } from "./spawn.ts";

const ENV_EXCEPTIONS = /\.(example|sample|template|dist)$/i;

export function isEnvException(filePath: string): boolean {
  return ENV_EXCEPTIONS.test(path.basename(filePath));
}

export function looksLikeEnvFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (isEnvException(filePath)) return false;
  return base === ".env" || base.startsWith(".env.");
}

export function resolveInsideWorkspace(workspaceRoots: string[], dest: string): string {
  const resolved = fs.realpathSync.native ? tryRealpath(path.resolve(dest)) : path.resolve(dest);
  const normalized = path.normalize(resolved);
  if (normalized.includes("..")) {
    throw new Error("Destination path must not contain '..'.");
  }
  const ok = workspaceRoots.some((root) => {
    const realRoot = tryRealpath(path.resolve(root));
    return normalized === realRoot || normalized.startsWith(realRoot + path.sep);
  });
  if (!ok) {
    throw new Error("Destination must be inside a workspace root.");
  }
  return normalized;
}

function tryRealpath(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

export async function isGitTracked(filePath: string, cwd: string): Promise<boolean> {
  const result = await spawnCapture("git", ["ls-files", "--error-unmatch", "--", filePath], { cwd });
  return result.code === 0;
}

export function ensureIgnoreLine(ignoreFile: string, pattern: string): boolean {
  let current = "";
  try {
    current = fs.readFileSync(ignoreFile, "utf8");
  } catch {
    current = "";
  }
  const lines = current.split(/\r?\n/);
  if (lines.some((line) => line.trim() === pattern)) return false;
  const next = current.endsWith("\n") || current.length === 0 ? `${current}${pattern}\n` : `${current}\n${pattern}\n`;
  fs.writeFileSync(ignoreFile, next);
  return true;
}

export function addDestinationIgnores(workspaceRoot: string, destAbs: string): void {
  const rel = path.relative(workspaceRoot, destAbs).split(path.sep).join("/");
  const pattern = rel.startsWith(".") ? rel : `/${rel}`;
  ensureIgnoreLine(path.join(workspaceRoot, ".gitignore"), pattern);
  ensureIgnoreLine(path.join(workspaceRoot, ".cursorignore"), pattern);
}

export function atomicWriteFile(filePath: string, contents: string, mode = 0o600): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents, { mode });
  fs.renameSync(tmp, filePath);
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    /* ignore on windows */
  }
}
