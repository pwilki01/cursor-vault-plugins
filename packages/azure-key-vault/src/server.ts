import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { registerPlugin } from "../../core/src/registry.ts";
import { safeErrorMessage } from "../../core/src/masker.ts";
import { parseRef } from "../../core/src/refs.ts";
import { upsertDotenv } from "../../core/src/dotenv.ts";
import { addDestinationIgnores, atomicWriteFile, isGitTracked, resolveInsideWorkspace } from "../../core/src/paths.ts";
import { findSecrets, getSecretValue, listVaults, status } from "./provider.ts";
import { recordPlacement } from "../../core/src/placements.ts";
import { copyToClipboard, hashValue, clearClipboardIfHash } from "../../core/src/clipboard.ts";
import { isAllowlisted, pipeToCommand } from "../../core/src/pipe.ts";
import { loadProjectConfig } from "../../core/src/config.ts";

const pluginRoot = process.env.CURSOR_PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerPlugin({
  name: "azure-key-vault",
  scheme: "akv",
  pluginRoot,
  secretRun: path.join(pluginRoot, "bin", "secret-run"),
  updatedAt: new Date().toISOString(),
});

function roots(args: Record<string, unknown>): string[] {
  return (args.workspaceRoots as string[]) ?? [process.env.CURSOR_WORKSPACE_ROOT || process.cwd()];
}

async function resolveAkv(refStr: string): Promise<{ vault: string; secret: string; value: string }> {
  const parsed = parseRef(refStr);
  if (parsed.scheme !== "akv") throw new Error("Expected an akv:// reference.");
  const value = await getSecretValue(parsed.vault, parsed.secret, parsed.version);
  return { vault: parsed.vault, secret: parsed.secret, value };
}

const tools = [
  {
    name: "status",
    description: "Whether az login credentials are available. Never returns secret values.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_vaults",
    description: "List Key Vault names and resource groups. Never returns secret values.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "find_secrets",
    description: "Search secret names, content types, and tags in a vault. Returns metadata only, never values.",
    inputSchema: {
      type: "object",
      required: ["vault", "query"],
      properties: { vault: { type: "string" }, query: { type: "string" } },
    },
  },
  {
    name: "place_in_dotenv",
    description: "Write an akv:// secret into a dotenv key. Returns path and key only.",
    inputSchema: {
      type: "object",
      required: ["ref", "path", "key"],
      properties: {
        ref: { type: "string" },
        path: { type: "string" },
        key: { type: "string" },
        workspaceRoots: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "copy_to_clipboard",
    description: "Copy an akv:// secret to the clipboard. Does not return the value.",
    inputSchema: {
      type: "object",
      required: ["ref"],
      properties: { ref: { type: "string" }, clearAfterSeconds: { type: "number" } },
    },
  },
  {
    name: "pipe_to_command",
    description: "Pipe an akv:// secret to an allowlisted command. Returns masked output.",
    inputSchema: {
      type: "object",
      required: ["ref", "argv"],
      properties: {
        ref: { type: "string" },
        argv: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        workspaceRoots: { type: "array", items: { type: "string" } },
      },
    },
  },
];

const server = new Server({ name: "azure-key-vault", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    let result: unknown;
    const ws = roots(args);
    const root = ws[0];
    switch (name) {
      case "status":
        result = await status();
        break;
      case "list_vaults":
        result = { vaults: await listVaults() };
        break;
      case "find_secrets":
        result = await findSecrets(String(args.vault), String(args.query));
        break;
      case "place_in_dotenv": {
        const { value } = await resolveAkv(String(args.ref));
        const abs = resolveInsideWorkspace(ws, path.resolve(root, String(args.path)));
        if (await isGitTracked(abs, root)) throw new Error("Refusing to write a secret into a git-tracked file.");
        const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
        atomicWriteFile(abs, upsertDotenv(current, String(args.key), value));
        addDestinationIgnores(root, abs);
        recordPlacement(root, {
          id: randomUUID(),
          ref: String(args.ref),
          destination: { kind: "dotenv", path: abs, key: String(args.key) },
          createdAt: new Date().toISOString(),
        });
        result = { status: "written", path: args.path, key: args.key };
        break;
      }
      case "copy_to_clipboard": {
        const { value } = await resolveAkv(String(args.ref));
        const hashed = hashValue(value);
        await copyToClipboard(value);
        const seconds = Number(args.clearAfterSeconds ?? 30);
        setTimeout(() => void clearClipboardIfHash(hashed), Math.max(1, seconds) * 1000).unref?.();
        result = { status: "copied", clearAfterSeconds: seconds };
        break;
      }
      case "pipe_to_command": {
        const { value } = await resolveAkv(String(args.ref));
        const argv = (args.argv as string[]) ?? [];
        if (!isAllowlisted(argv, loadProjectConfig(root).pipe_allowlist)) {
          throw new Error("Command is not on the pipe allowlist.");
        }
        result = await pipeToCommand(argv, value, (args.cwd as string) || root);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: safeErrorMessage(err) }] };
  }
});

await server.connect(new StdioServerTransport());
