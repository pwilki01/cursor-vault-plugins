#!/usr/bin/env node
import fs from "node:fs";

const CANARY = "CANARY_PASSWORD";
const args = process.argv.slice(2);
const cmd = args[0];
const sub = args[1];

const folders = [
  { id: "folder-1", name: "Work" },
  { id: "folder-2", name: "Personal" },
];

const items = [
  {
    id: "item-aon",
    name: "Aon Intelligence CRM",
    type: 1,
    folderId: "folder-1",
    revisionDate: "2026-01-01T00:00:00.000Z",
    notes: "aon intelligence",
    login: {
      username: "user@aon.com",
      password: CANARY,
      totp: "otpauth://totp/CANARY",
      uris: [{ uri: "https://crm.aonintelligence.example" }],
    },
    fields: [{ name: "recovery", value: CANARY, type: 1 }],
    passwordHistory: [{ password: CANARY }],
  },
  {
    id: "item-decoy-notes",
    name: "Unrelated SaaS",
    type: 1,
    folderId: "folder-2",
    revisionDate: "2026-02-01T00:00:00.000Z",
    notes: "aon intelligence",
    login: {
      username: "nobody",
      password: CANARY,
      uris: [{ uri: "https://example.com" }],
    },
  },
  {
    id: "item-card",
    name: "Aon Intelligence Card",
    type: 3,
    folderId: "folder-1",
    notes: "",
    card: { number: CANARY, code: "123" },
  },
];

function dump(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (cmd === "status") {
  dump({
    status: process.env.BW_STUB_STATUS || "unlocked",
    serverUrl: "https://vault.bitwarden.com",
    userEmail: "dev@example.com",
  });
  process.exit(0);
}

if (cmd === "lock") process.exit(0);

if (cmd === "list" && sub === "folders") {
  dump(folders);
  process.exit(0);
}

if (cmd === "list" && sub === "items") {
  dump(items);
  process.exit(0);
}

if (cmd === "get" && sub === "item") {
  const id = args[2];
  const found = items.find((i) => i.id === id || i.name === id);
  if (!found) process.exit(1);
  dump(found);
  process.exit(0);
}

if (cmd === "get" && sub === "password") {
  process.stdout.write(`${CANARY}\n`);
  process.exit(0);
}

process.stderr.write(`unexpected bw args: ${args.join(" ")}\n`);
process.exit(2);
