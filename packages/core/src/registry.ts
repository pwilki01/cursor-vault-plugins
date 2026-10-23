import fs from "node:fs";
import { secretPluginsPath, readJsonFile, writeJsonFile } from "./home.ts";

export type PluginRegistryEntry = {
  name: "bitwarden" | "azure-key-vault";
  scheme: "bw" | "akv";
  pluginRoot: string;
  secretRun: string;
  loginHelper?: string;
  updatedAt: string;
};

type Registry = { plugins: PluginRegistryEntry[] };

export function registryPath(): string {
  return secretPluginsPath("registry.json");
}

export function loadRegistry(): PluginRegistryEntry[] {
  return readJsonFile<Registry>(registryPath(), { plugins: [] }).plugins;
}

export function registerPlugin(entry: PluginRegistryEntry): void {
  const plugins = loadRegistry().filter((p) => p.name !== entry.name);
  plugins.push(entry);
  writeJsonFile(registryPath(), { plugins });
}

export function findPluginByScheme(scheme: "bw" | "akv"): PluginRegistryEntry | undefined {
  return loadRegistry().find((p) => p.scheme === scheme);
}

export function extensionAckPath(): string {
  return secretPluginsPath("login-ack");
}

export function loginNoncePath(): string {
  return secretPluginsPath("login-nonce");
}

export function writeLoginNonce(nonce: string): void {
  fs.writeFileSync(loginNoncePath(), nonce, { mode: 0o600 });
}

export function readLoginNonce(): string | null {
  try {
    return fs.readFileSync(loginNoncePath(), "utf8").trim();
  } catch {
    return null;
  }
}

export function consumeLoginNonce(expected: string): boolean {
  const current = readLoginNonce();
  try {
    fs.unlinkSync(loginNoncePath());
  } catch {
    /* already gone */
  }
  return Boolean(current && current === expected);
}
