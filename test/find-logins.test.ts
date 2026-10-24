import assert from "node:assert/strict";
import { test } from "node:test";
import { matchLogins, toFindLoginsResult, tokenize } from "../packages/bitwarden/src/search.ts";
import { stripItems, folderMap, toLoginMetadata, LOGIN_TYPE, type LoginMetadata } from "../packages/bitwarden/src/strip.ts";

const CANARY = "CANARY_PASSWORD";

const folders = folderMap([
  { id: "folder-1", name: "Work" },
  { id: "folder-2", name: "Personal" },
]);

const rawItems = [
  {
    id: "item-acme",
    name: "Acme Corp CRM",
    type: 1,
    folderId: "folder-1",
    revisionDate: "2026-01-01T00:00:00.000Z",
    notes: "acme corp",
    login: {
      username: "user@acme.example",
      password: CANARY,
      totp: "otpauth://totp/x",
      uris: [{ uri: "https://crm.acmecorp.example" }],
    },
    fields: [{ name: "recovery", value: CANARY }],
    passwordHistory: [{ password: CANARY }],
  },
  {
    id: "item-decoy",
    name: "Unrelated SaaS",
    type: 1,
    folderId: "folder-2",
    notes: "acme corp",
    login: { username: "nobody", password: CANARY, uris: [] },
  },
  {
    id: "item-card",
    name: "Acme Corp Card",
    type: 3,
    folderId: "folder-1",
    card: { number: CANARY },
  },
];

test("tokenize splits on whitespace", () => {
  assert.deepEqual(tokenize("  Acme   Corp "), ["acme", "corp"]);
});

test("stripItems keeps only metadata and clears the source array", () => {
  const copy = JSON.parse(JSON.stringify(rawItems));
  const meta = stripItems(copy, folders);
  assert.equal(copy.length, 0);
  const acme = meta.find((m) => m.id === "item-acme");
  assert.ok(acme);
  assert.equal(acme?.name, "Acme Corp CRM");
  assert.equal(acme?.username, "user@acme.example");
  assert.deepEqual(acme?.uriHosts, ["crm.acmecorp.example"]);
  assert.equal(acme?.folder, "Work");
  const blob = JSON.stringify(meta);
  assert.equal(blob.includes(CANARY), false);
  assert.equal(blob.toLowerCase().includes("otpauth"), false);
});

test("related-to query returns the exact login name", () => {
  const meta = stripItems(JSON.parse(JSON.stringify(rawItems)), folders);
  const matches = matchLogins(meta, "acme corp");
  const result = toFindLoginsResult("acme corp", matches);
  assert.equal(result.count, 1);
  assert.equal(result.matches[0].name, "Acme Corp CRM");
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});

test("password query matches nothing", () => {
  const meta = stripItems(JSON.parse(JSON.stringify(rawItems)), folders);
  const matches = matchLogins(meta, CANARY);
  assert.equal(matches.length, 0);
});

test("notes-only query matches nothing", () => {
  const meta = stripItems(JSON.parse(JSON.stringify(rawItems)), folders);
  const decoyOnly = matchLogins(meta, "acme corp");
  assert.equal(decoyOnly.some((m) => m.name === "Unrelated SaaS"), false);
});

test("non-logins are excluded unless requested", () => {
  const meta = stripItems(JSON.parse(JSON.stringify(rawItems)), folders);
  assert.equal(matchLogins(meta, "acme corp").some((m) => m.type !== LOGIN_TYPE), false);
  const withCards = matchLogins(meta, "acme corp", { includeNonLogins: true });
  assert.ok(withCards.some((m) => m.name === "Acme Corp Card"));
});

test("toLoginMetadata never copies secret keys", () => {
  const meta: LoginMetadata = toLoginMetadata(rawItems[0] as Record<string, unknown>, "Work");
  assert.equal("password" in meta, false);
  assert.equal("notes" in (meta as object), false);
});
