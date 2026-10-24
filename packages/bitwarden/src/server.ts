import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerPlugin } from "../../core/src/registry.ts";
import { safeErrorMessage } from "../../core/src/masker.ts";
import { BitwardenProvider } from "./provider.ts";
import { startLogin, waitForSignin } from "./login-launch.ts";

const pluginRoot = process.env.CURSOR_PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

registerPlugin({
  name: "bitwarden",
  scheme: "bw",
  pluginRoot,
  secretRun: path.join(pluginRoot, "bin", "secret-run"),
  loginHelper: path.join(pluginRoot, "bin", "bw-login"),
  updatedAt: new Date().toISOString(),
});

function provider(args: Record<string, unknown> | undefined): BitwardenProvider {
  const roots = (args?.workspaceRoots as string[] | undefined) ?? (process.env.CURSOR_WORKSPACE_ROOT ? [process.env.CURSOR_WORKSPACE_ROOT] : [process.cwd()]);
  return new BitwardenProvider(roots);
}

const tools = [
  {
    name: "status",
    description: "Bitwarden CLI install state and whether the vault is unauthenticated, locked, or unlocked. Never returns secrets.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "find_logins",
    description:
      "Search Bitwarden logins by name, username, URI host, and folder. Returns exact login names and metadata only — never passwords, TOTP, notes, or field values. Use for questions like 'are there logins related to acme corp'.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        includeNonLogins: { type: "boolean" },
        workspaceRoots: { type: "array", items: { type: "string" } },
      },
      required: ["query"],
    },
  },
  {
    name: "login",
    description: "Open Bitwarden sign-in in a Cursor terminal (or an external terminal fallback). Does not collect the master password in chat.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wait_for_signin",
    description: "Poll Bitwarden status until login finishes or ~45 seconds elapse. Repeat if still waiting.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "unlock",
    description: "Open a native OS password dialog to unlock the vault. The agent never sees the master password.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "lock",
    description: "Lock the Bitwarden vault and drop the stored session.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "place_in_dotenv",
    description: "Resolve a bw:// reference and write it as a key in a dotenv file. Returns path and key only.",
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
    name: "render_template",
    description: "Replace {{bw://...}} placeholders in a template file and write a gitignored output file.",
    inputSchema: {
      type: "object",
      required: ["templatePath", "outputPath"],
      properties: {
        templatePath: { type: "string" },
        outputPath: { type: "string" },
        workspaceRoots: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "copy_to_clipboard",
    description: "Copy a bw:// secret to the clipboard and clear it after a timeout. Does not return the value.",
    inputSchema: {
      type: "object",
      required: ["ref"],
      properties: {
        ref: { type: "string" },
        clearAfterSeconds: { type: "number" },
        workspaceRoots: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "pipe_to_command",
    description: "Pipe a secret to an allowlisted command's stdin. Returns masked stdout/stderr.",
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
  {
    name: "list_placements",
    description: "List recorded secret placements (refs and destinations, never values).",
    inputSchema: {
      type: "object",
      properties: { workspaceRoots: { type: "array", items: { type: "string" } } },
    },
  },
  {
    name: "refresh_placements",
    description: "Re-fetch every recorded dotenv/template placement after a rotation.",
    inputSchema: {
      type: "object",
      properties: { workspaceRoots: { type: "array", items: { type: "string" } } },
    },
  },
  {
    name: "remove_placement",
    description: "Remove a placement record by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        workspaceRoots: { type: "array", items: { type: "string" } },
      },
    },
  },
];

const server = new Server({ name: "bitwarden", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    const p = provider(args);
    let result: unknown;
    switch (name) {
      case "status":
        result = await p.status();
        break;
      case "find_logins":
        result = await p.findLogins(String(args.query ?? ""), Boolean(args.includeNonLogins));
        break;
      case "login":
        result = await startLogin();
        break;
      case "wait_for_signin":
        result = await waitForSignin();
        break;
      case "unlock":
        result = await p.unlock();
        break;
      case "lock":
        result = await p.lock();
        break;
      case "place_in_dotenv":
        result = await p.placeInDotenv(String(args.ref), String(args.path), String(args.key));
        break;
      case "render_template":
        result = await p.renderTemplate(String(args.templatePath), String(args.outputPath));
        break;
      case "copy_to_clipboard":
        result = await p.copyToClipboard(String(args.ref), Number(args.clearAfterSeconds ?? 30));
        break;
      case "pipe_to_command":
        result = await p.pipeToCommand(String(args.ref), (args.argv as string[]) ?? [], args.cwd as string | undefined);
        break;
      case "list_placements":
        result = p.listPlacements();
        break;
      case "refresh_placements":
        result = await p.refreshPlacements();
        break;
      case "remove_placement":
        result = p.removePlacement(String(args.id));
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: safeErrorMessage(err) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
