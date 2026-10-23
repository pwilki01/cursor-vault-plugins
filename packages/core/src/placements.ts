import fs from "node:fs";
import path from "node:path";
import { readJsonFile, writeJsonFile } from "./home.ts";

export type Placement = {
  id: string;
  ref: string;
  destination:
    | { kind: "dotenv"; path: string; key: string }
    | { kind: "template"; templatePath: string; outputPath: string }
    | { kind: "clipboard"; clearAfterSeconds: number }
    | { kind: "pipe"; argv: string[] };
  createdAt: string;
};

type Manifest = { placements: Placement[] };

function manifestPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".cursor", "secret-placements.json");
}

export function loadPlacements(workspaceRoot: string): Placement[] {
  return readJsonFile<Manifest>(manifestPath(workspaceRoot), { placements: [] }).placements;
}

export function savePlacements(workspaceRoot: string, placements: Placement[]): void {
  writeJsonFile(manifestPath(workspaceRoot), { placements }, 0o644);
}

export function recordPlacement(workspaceRoot: string, placement: Placement): void {
  const all = loadPlacements(workspaceRoot);
  const next = all.filter((p) => p.id !== placement.id);
  next.push(placement);
  fs.mkdirSync(path.join(workspaceRoot, ".cursor"), { recursive: true });
  savePlacements(workspaceRoot, next);
}

export function removePlacement(workspaceRoot: string, id: string): boolean {
  const all = loadPlacements(workspaceRoot);
  const next = all.filter((p) => p.id !== id);
  if (next.length === all.length) return false;
  savePlacements(workspaceRoot, next);
  return true;
}

export function placedPaths(workspaceRoot: string): string[] {
  return loadPlacements(workspaceRoot)
    .map((p) => {
      if (p.destination.kind === "dotenv") return p.destination.path;
      if (p.destination.kind === "template") return p.destination.outputPath;
      return null;
    })
    .filter((p): p is string => Boolean(p));
}
