import fs from "node:fs";
import path from "node:path";

export function writeBinLauncher(pluginDir, name, distRel) {
  const binDir = path.join(pluginDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const unix = `#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, "..", ${JSON.stringify(distRel)})).href);
`;
  const file = path.join(binDir, name);
  fs.writeFileSync(file, unix);
  fs.chmodSync(file, 0o755);
  fs.writeFileSync(
    `${file}.cmd`,
    `@echo off\r\nnode "%~dp0..\\${distRel.replace(/\//g, "\\")}" %*\r\n`,
  );
}
