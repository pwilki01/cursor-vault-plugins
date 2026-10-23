import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./home.ts";

export type ProjectSecretsConfig = {
  env?: Record<string, string>;
  wrap_commands?: string[];
  wrap_mode?: "rewrite" | "suggest";
  pipe_allowlist?: string[][];
  env_files?: string[];
  autolock_minutes?: number;
};

export function loadProjectConfig(workspaceRoot: string): ProjectSecretsConfig {
  return readJsonFile<ProjectSecretsConfig>(path.join(workspaceRoot, ".cursor", "secrets.json"), {});
}

export function defaultWrapMode(config: ProjectSecretsConfig): "rewrite" | "suggest" {
  return config.wrap_mode === "suggest" ? "suggest" : "rewrite";
}

export function readAutolockMinutes(): number {
  const homeConfig = path.join(process.env.HOME ?? "", ".cursor", "secret-plugins", "config.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(homeConfig, "utf8")) as { autolock_minutes?: number };
    if (typeof parsed.autolock_minutes === "number" && parsed.autolock_minutes > 0) {
      return parsed.autolock_minutes;
    }
  } catch {
    /* default */
  }
  return 60;
}
