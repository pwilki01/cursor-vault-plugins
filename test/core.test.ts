import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRef, formatRef, findTemplateRefs } from "../packages/core/src/refs.ts";
import { upsertDotenv } from "../packages/core/src/dotenv.ts";
import { isAllowlisted } from "../packages/core/src/pipe.ts";
import { deleteFileSecret, readFileSecret, writeFileSecret } from "../packages/core/src/credentials.ts";
import { renderTemplateText } from "../packages/core/src/template.ts";

test("parse bw and akv refs", () => {
  const bw = parseRef("bw://Prod SQL/password");
  assert.equal(bw.scheme, "bw");
  if (bw.scheme === "bw") {
    assert.equal(bw.item, "Prod SQL");
    assert.equal(bw.field, "password");
  }
  const akv = parseRef("akv://kv-app/stripe-key/v1");
  assert.equal(akv.scheme, "akv");
  if (akv.scheme === "akv") {
    assert.equal(akv.vault, "kv-app");
    assert.equal(akv.secret, "stripe-key");
    assert.equal(akv.version, "v1");
  }
  assert.equal(formatRef(parseRef("bw://x")).includes("bw://"), true);
  assert.deepEqual(findTemplateRefs("a {{bw://Prod SQL/password}} b"), ["bw://Prod SQL/password"]);
});

test("dotenv upsert keeps comments and updates keys", () => {
  const src = "# hi\nFOO=1\nBAR=2\n";
  const next = upsertDotenv(src, "FOO", "secret value");
  assert.match(next, /^# hi/m);
  assert.match(next, /FOO="secret value"/);
  assert.match(next, /BAR=2/);
});

test("pipe allowlist", () => {
  assert.equal(isAllowlisted(["docker", "login", "--password-stdin"]), true);
  assert.equal(isAllowlisted(["gh", "secret", "set", "NAME"]), true);
  assert.equal(isAllowlisted(["curl", "https://evil"]), false);
});

test("file secret store persists a session for platforms without keychain", () => {
  const account = `test-session-${process.pid}`;
  try {
    writeFileSecret(account, "session-token");
    assert.equal(readFileSecret(account), "session-token");
  } finally {
    deleteFileSecret(account);
    assert.equal(readFileSecret(account), null);
  }
});

test("mixed template refs all resolve when the resolver has both schemes", () => {
  const src = "DB={{bw://Prod SQL/password}}\nSTRIPE={{akv://kv/stripe}}\n";
  const { output, unresolved } = renderTemplateText(src, (raw) => {
    if (raw.startsWith("bw://")) return "from-bw";
    if (raw.startsWith("akv://")) return "from-akv";
    throw new Error("unexpected");
  });
  assert.equal(unresolved.length, 0);
  assert.equal(output.includes("from-bw"), true);
  assert.equal(output.includes("from-akv"), true);
  assert.equal(output.includes("{{"), false);
});
