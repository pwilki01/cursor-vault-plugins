import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeBinLauncher } from "./write-bin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const bitwardenEntries = {
  "server.mjs": "packages/bitwarden/src/server.ts",
  "secret-run.mjs": "packages/bitwarden/src/secret-run.ts",
  "bw-login.mjs": "packages/bitwarden/src/bw-login.ts",
  "bw-unlock.mjs": "packages/bitwarden/src/bw-unlock.ts",
  "hooks/shell-guard.mjs": "packages/bitwarden/src/hooks/shell-guard.ts",
  "hooks/read-guard.mjs": "packages/bitwarden/src/hooks/read-guard.ts",
  "hooks/mcp-guard.mjs": "packages/bitwarden/src/hooks/mcp-guard.ts",
};

const azureEntries = {
  "server.mjs": "packages/azure-key-vault/src/server.ts",
  "hooks/shell-guard.mjs": "packages/azure-key-vault/src/hooks/shell-guard.ts",
  "hooks/read-guard.mjs": "packages/azure-key-vault/src/hooks/read-guard.ts",
  "hooks/mcp-guard.mjs": "packages/azure-key-vault/src/hooks/mcp-guard.ts",
};

async function bundle(pluginRel, entries) {
  const outdir = path.join(root, pluginRel, "dist");
  fs.mkdirSync(outdir, { recursive: true });
  for (const [out, entry] of Object.entries(entries)) {
    const outfile = path.join(outdir, out);
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    await esbuild.build({
      absWorkingDir: root,
      entryPoints: [path.join(root, entry)],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      packages: "bundle",
      banner: {
        js: `import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);`,
      },
      logLevel: "warning",
    });
  }
}

await bundle("plugins/bitwarden", bitwardenEntries);
await bundle("plugins/azure-key-vault", azureEntries);

const bw = path.join(root, "plugins/bitwarden");
writeBinLauncher(bw, "shell-guard", "dist/hooks/shell-guard.mjs");
writeBinLauncher(bw, "read-guard", "dist/hooks/read-guard.mjs");
writeBinLauncher(bw, "mcp-guard", "dist/hooks/mcp-guard.mjs");
writeBinLauncher(bw, "secret-run", "dist/secret-run.mjs");
writeBinLauncher(bw, "bw-login", "dist/bw-login.mjs");
writeBinLauncher(bw, "bw-unlock", "dist/bw-unlock.mjs");

const akv = path.join(root, "plugins/azure-key-vault");
writeBinLauncher(akv, "shell-guard", "dist/hooks/shell-guard.mjs");
writeBinLauncher(akv, "read-guard", "dist/hooks/read-guard.mjs");
writeBinLauncher(akv, "mcp-guard", "dist/hooks/mcp-guard.mjs");
writeBinLauncher(akv, "secret-run", "dist/secret-run.mjs");

fs.copyFileSync(path.join(bw, "dist/secret-run.mjs"), path.join(akv, "dist/secret-run.mjs"));

console.log("build ok");
