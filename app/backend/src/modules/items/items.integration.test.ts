/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { migrate } from "../../db/migrate.js";
import { base32Decode, hotp, totpStep } from "../auth/totp.js";
import { purgeExpired } from "./service.js";

/** Needs TEST_DATABASE_URL (an EMPTY throwaway database; it is wiped). */
const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : "TEST_DATABASE_URL not set" };

const ORIGIN = "https://vault.test";
const PASSWORD = "Tr1cky-Vault-Pass!";
const SECRET_PW = "hunter2-S3cret-Pa55word!";
const CARD = "4111111111111111";
const clock = 1_800_000_000_000;
let app: FastifyInstance;
let pool: pg.Pool;
let env: ReturnType<typeof loadEnv>;
const me = { cookie: "", csrf: "" };

async function call(
  method: string,
  u: string,
  body?: unknown,
  who: { cookie?: string; csrf?: string } | null = me,
) {
  const res = await app.inject({
    method: method as "GET",
    url: u,
    remoteAddress: "10.1.1.1",
    headers: {
      origin: ORIGIN,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(who?.cookie ? { cookie: who.cookie } : {}),
      ...(who?.csrf ? { "x-csrf-token": who.csrf } : {}),
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
  const cookie = res.cookies[0];
  const json = res.body ? (JSON.parse(res.body) as any) : {};
  return { status: res.statusCode, json, raw: res.body, cookie, headers: res.headers };
}

before(async () => {
  if (!url) return;
  pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION citext;");
  await migrate(
    pool,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../migrations"),
  );
  const setupToken = randomBytes(24).toString("hex");
  env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: url,
    APP_SECRET: randomBytes(32).toString("hex"),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    TOTP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    APP_ORIGIN: ORIGIN,
    COOKIE_SECURE: "true",
    SETUP_TOKEN: setupToken,
  });
  app = await buildApp({ env, pool, now: () => clock });
  const s = await call(
    "POST",
    "/api/auth/setup",
    { username: "alex", password: PASSWORD, setupToken },
    null,
  );
  me.cookie = `${s.cookie!.name}=${s.cookie!.value}`;
  me.csrf = s.json.csrfToken;
  const code = hotp(base32Decode(s.json.totp.secret), totpStep(clock));
  const v = await call("POST", "/api/auth/setup/verify", { code });
  assert.equal(v.status, 200);
  me.cookie = `${v.cookie!.name}=${v.cookie!.value}`;
  me.csrf = v.json.csrfToken;
});
after(async () => {
  await app?.close();
  await pool?.end();
});

const audit = async (type: string) =>
  (await pool.query("SELECT * FROM audit_log WHERE event_type = $1 ORDER BY id", [type])).rows;

test("everything requires an authenticated, CSRF-protected session", opts, async () => {
  assert.equal((await call("GET", "/api/items", undefined, null)).status, 401);
  assert.equal(
    (await call("POST", "/api/items/password", { title: "x", password: "y" }, null)).status,
    401,
  );
  assert.equal((await call("GET", "/api/audit", undefined, null)).status, 401);
  const noCsrf = await call(
    "POST",
    "/api/items/password",
    { title: "x", password: "y" },
    { cookie: me.cookie },
  );
  assert.equal(noCsrf.status, 403);
});

let pwId = "";
test(
  "password items: encrypted at rest, never listed, revealed on demand with audit",
  opts,
  async () => {
    const c = await call("POST", "/api/items/password", {
      title: "Gmail",
      websiteName: "Google",
      url: "https://mail.google.com",
      username: "alex@example.com",
      password: SECRET_PW,
      notes: "recovery phone ends 4455",
      tags: ["Home", "Important"],
      favorite: true,
    });
    assert.equal(c.status, 201);
    pwId = c.json.id;
    assert.equal(c.json.strength, "strong");
    assert.equal(c.raw.includes(SECRET_PW), false, "create response has no secret");
    assert.equal(c.json.notes, "recovery phone ends 4455", "detail carries decrypted notes");

    const list = await call("GET", "/api/items?kind=password");
    assert.equal(list.json.items.length, 1);
    assert.equal(list.raw.includes(SECRET_PW), false);
    assert.equal(list.raw.includes("recovery phone"), false, "notes are not in lists");
    assert.deepEqual(list.json.items[0].tags, ["Home", "Important"]);

    const row = (await pool.query("SELECT password_enc FROM password_items")).rows[0];
    assert.equal(
      row.password_enc.includes(Buffer.from(SECRET_PW)),
      false,
      "ciphertext, not plaintext",
    );
    const notes = (await pool.query("SELECT notes_enc FROM items WHERE id = $1", [pwId])).rows[0];
    assert.equal(notes.notes_enc.includes(Buffer.from("recovery phone")), false);

    const view = await call("POST", `/api/items/${pwId}/reveal`, { field: "password" });
    assert.equal(view.json.value, SECRET_PW);
    await call("POST", `/api/items/${pwId}/reveal`, { field: "password", purpose: "copy" });
    assert.equal((await audit("PASSWORD_VIEWED")).length, 1);
    assert.equal((await audit("PASSWORD_COPIED")).length, 1);
    assert.equal((await audit("RECORD_CREATED"))[0].item_label, "Gmail");
  },
);

test(
  "input validation: unsafe URLs, bad IPs, unknown fields and bad ids are refused",
  opts,
  async () => {
    const bad = [
      ["password", { title: "x", password: "p", url: "javascript:alert(1)" }],
      ["password", { title: "x", password: "p", isAdmin: true }],
      ["password", { title: "", password: "p" }],
      ["password", { title: "x" }],
      ["network", { title: "r", deviceType: "Toaster", ip: "192.168.1.1" }],
      ["network", { title: "r", deviceType: "Router", ip: "999.1.1.1" }],
      ["network", { title: "r", deviceType: "Router", managementUrl: "ftp://x" }],
      ["card", { title: "c", number: "12ab", brand: "visa" }],
      ["card", { title: "c", number: CARD, last4: "0000" }],
    ] as const;
    for (const [kind, body] of bad)
      assert.equal(
        (await call("POST", `/api/items/${kind}`, body)).status,
        422,
        JSON.stringify(body),
      );
    assert.equal((await call("GET", "/api/items/not-a-uuid")).status, 404);
    assert.equal((await call("POST", "/api/items/widget", {})).status, 404);
    const err = await call("POST", "/api/items/password", {
      title: "x",
      password: "p",
      url: "javascript:1",
    });
    assert.equal(
      JSON.stringify(err.json).includes("javascript"),
      false,
      "errors never echo submitted values",
    );
  },
);

let netId = "";
test("network items", opts, async () => {
  const c = await call("POST", "/api/items/network", {
    title: "Main Router",
    deviceType: "Router",
    ip: "192.168.1.1",
    hostname: "gw.lan",
    managementUrl: "http://192.168.1.1",
    port: 8443,
    username: "admin",
    password: "router-pass-9",
    mac: "AA-BB-CC-DD-EE-FF",
    vlan: "10",
    tags: ["Network"],
  });
  assert.equal(c.status, 201);
  netId = c.json.id;
  assert.equal(c.json.ip, "192.168.1.1");
  assert.equal(c.json.mac, "aa:bb:cc:dd:ee:ff");
  assert.equal(c.json.hasPassword, true);
  assert.equal(c.raw.includes("router-pass-9"), false);
  const r = await call("POST", `/api/items/${netId}/reveal`, { field: "password" });
  assert.equal(r.json.value, "router-pass-9");
});

let cardId = "";
test(
  "cards: last4 derived server-side, number and expiry revealed explicitly, CVV refused",
  opts,
  async () => {
    const c = await call("POST", "/api/items/card", {
      title: "Visa personal",
      holder: "A. Cohen",
      issuer: "Leumi",
      brand: "visa",
      number: "4111 1111 1111 1111",
      expiry: "08/29",
      gradient: "violet",
    });
    assert.equal(c.status, 201);
    cardId = c.json.id;
    assert.equal(c.json.last4, "1111");
    assert.equal(c.raw.includes(CARD), false);
    assert.equal(c.raw.includes("08/29"), false);
    const db = (await pool.query("SELECT number_enc, expiry_enc, cvv_enc FROM card_items")).rows[0];
    assert.equal(db.number_enc.includes(Buffer.from(CARD)), false);
    assert.equal(db.cvv_enc, null);
    assert.equal(
      (await call("POST", `/api/items/${cardId}/reveal`, { field: "number" })).json.value,
      CARD,
    );
    assert.equal(
      (await call("POST", `/api/items/${cardId}/reveal`, { field: "expiry" })).json.value,
      "08/29",
    );
    assert.equal((await audit("CARD_REVEALED")).length, 2);
    const cvv = await call("POST", "/api/items/card", { title: "c2", number: CARD, cvv: "123" });
    assert.equal(cvv.status, 422, "CVV storage is off by default");
    assert.equal((await call("POST", `/api/items/${cardId}/reveal`, { field: "cvv" })).status, 404);
  },
);

let recId = "";
test(
  "records: sensitive custom fields are encrypted and only revealed on demand",
  opts,
  async () => {
    const c = await call("POST", "/api/items/record", {
      title: "Insurance",
      fields: [
        { name: "Customer no.", sensitive: false, value: "123456789" },
        { name: "PIN", sensitive: true, value: "9876" },
      ],
    });
    assert.equal(c.status, 201);
    recId = c.json.id;
    const [open, hidden] = c.json.fields;
    assert.equal(open.value, "123456789");
    assert.equal("value" in hidden, false);
    assert.equal(c.raw.includes("9876"), false);
    const row = (await pool.query("SELECT value, value_enc FROM record_fields WHERE sensitive"))
      .rows[0];
    assert.equal(row.value, null);
    assert.equal(row.value_enc.includes(Buffer.from("9876")), false);
    assert.equal(
      (await call("POST", `/api/items/${recId}/reveal`, { field: `field:${hidden.id}` })).json
        .value,
      "9876",
    );

    // Editing: rename the open field, keep the hidden one without resending its value.
    const u = await call("PUT", `/api/items/${recId}`, {
      fields: [
        { id: open.id, name: "Customer number", sensitive: false, value: "123456789" },
        { id: hidden.id, name: "PIN", sensitive: true },
      ],
    });
    assert.equal(u.status, 200);
    const again = u.json.fields.find((f: any) => f.name === "PIN");
    assert.equal(
      (await call("POST", `/api/items/${recId}/reveal`, { field: `field:${again.id}` })).json.value,
      "9876",
    );
    // A new sensitive field with no value is refused.
    const empty = await call("PUT", `/api/items/${recId}`, {
      fields: [{ name: "New", sensitive: true }],
    });
    assert.equal(empty.status, 422);
    assert.equal(
      (await call("GET", `/api/items/${recId}`)).json.fields.length,
      2,
      "failed update changed nothing",
    );
  },
);

test("a ciphertext moved to another row cannot be decrypted (AAD binding)", opts, async () => {
  const other = await call("POST", "/api/items/password", {
    title: "Other",
    password: "other-pass-123",
  });
  await pool.query(
    `UPDATE password_items SET password_enc = (SELECT password_enc FROM password_items WHERE item_id = $1) WHERE item_id = $2`,
    [pwId, other.json.id],
  );
  const r = await call("POST", `/api/items/${other.json.id}/reveal`, { field: "password" });
  assert.notEqual(r.status, 200);
  assert.equal(r.raw.includes(SECRET_PW), false);
});

test("updates are partial; secrets omitted stay unchanged; kind cannot change", opts, async () => {
  const u = await call("PUT", `/api/items/${pwId}`, { title: "Gmail (work)", tags: ["Office"] });
  assert.equal(u.status, 200);
  assert.equal(u.json.title, "Gmail (work)");
  assert.deepEqual(u.json.tags, ["Office"]);
  assert.equal(u.json.username, "alex@example.com");
  assert.equal(
    (await call("POST", `/api/items/${pwId}/reveal`, { field: "password" })).json.value,
    SECRET_PW,
  );
  const tags = (await call("GET", "/api/tags")).json.tags;
  assert.equal(tags.includes("Home"), false, "orphaned tags are removed");
  assert.equal((await call("PUT", `/api/items/${pwId}`, { deviceType: "Router" })).status, 422);
  const nw = await call("PUT", `/api/items/${pwId}`, { password: "brand-new-Pass-77!" });
  assert.equal(
    (await call("POST", `/api/items/${pwId}/reveal`, { field: "password" })).json.value,
    "brand-new-Pass-77!",
  );
  assert.equal(nw.json.id, pwId);
  assert.equal((await audit("RECORD_UPDATED")).length >= 2, true);
});

test("favorites and categories", opts, async () => {
  assert.equal(
    (await call("POST", `/api/items/${netId}/favorite`, { favorite: true })).status,
    200,
  );
  const favs = (await call("GET", "/api/items?favorite=true")).json.items;
  assert.deepEqual(favs.map((i: any) => i.id).sort(), [netId, pwId].sort());

  const cat = await call("POST", "/api/categories", {
    name: "Banking",
    icon: "landmark",
    color: "#22d3ee",
    section: "cards",
  });
  assert.equal(cat.status, 201);
  assert.equal(
    (await call("POST", "/api/categories", { name: "Banking", section: "cards" })).status,
    409,
  );
  assert.equal(
    (await call("POST", "/api/categories", { name: "x", icon: "<script>" })).status,
    422,
  );
  assert.equal(
    (await call("PUT", `/api/items/${cardId}`, { categoryId: cat.json.id })).json.categoryId,
    cat.json.id,
  );
  assert.equal(
    (
      await call("PUT", `/api/items/${cardId}`, {
        categoryId: "00000000-0000-4000-8000-000000000000",
      })
    ).status,
    422,
  );
  assert.equal((await call("GET", `/api/items?category=${cat.json.id}`)).json.items.length, 1);
  assert.equal(
    (
      await call("PUT", `/api/categories/${cat.json.id}`, {
        name: "Bank",
        icon: "landmark",
        section: "cards",
      })
    ).json.name,
    "Bank",
  );
  assert.equal((await call("DELETE", `/api/categories/${cat.json.id}`)).status, 200);
  assert.equal(
    (await call("GET", `/api/items/${cardId}`)).json.categoryId,
    undefined,
    "items survive category deletion",
  );
});

test("search covers metadata, not secrets; wildcards are literal", opts, async () => {
  const hit = async (q: string) =>
    (await call("GET", `/api/search?q=${encodeURIComponent(q)}`)).json.items.map(
      (i: any) => i.title,
    );
  assert.deepEqual(await hit("gw.lan"), ["Main Router"]);
  assert.deepEqual(await hit("192.168.1"), ["Main Router"]);
  assert.deepEqual(await hit("alex@example"), ["Gmail (work)"]);
  assert.deepEqual(await hit("Office"), ["Gmail (work)"], "by tag");
  assert.deepEqual(await hit("Customer number"), ["Insurance"], "by custom field name");
  assert.deepEqual(await hit("1111"), ["Visa personal"], "by last 4 digits");
  assert.deepEqual(await hit("brand-new-Pass"), [], "passwords are not searchable");
  assert.deepEqual(await hit("9876"), [], "sensitive fields are not searchable");
  assert.deepEqual(await hit("%"), [], "% is not a wildcard");
  assert.deepEqual(await hit("recovery phone"), [], "notes are not searchable");
  assert.equal((await call("GET", "/api/search")).status, 422);
});

test("trash: soft delete, restore, purge only from the trash, retention purge", opts, async () => {
  const x = await call("POST", "/api/items/password", {
    title: "Temp",
    password: "temp-pass-12345",
  });
  assert.equal((await call("DELETE", `/api/items/${x.json.id}`)).status, 200);
  assert.equal((await call("GET", `/api/items/${x.json.id}`)).status, 404);
  assert.equal(
    (await call("POST", `/api/items/${x.json.id}/reveal`, { field: "password" })).status,
    404,
  );
  assert.equal((await call("PUT", `/api/items/${x.json.id}`, { title: "zombie" })).status, 404);
  const trash = (await call("GET", "/api/trash")).json;
  assert.equal(trash.retentionDays, 30);
  assert.deepEqual(
    trash.items.map((i: any) => i.title),
    ["Temp"],
  );
  assert.ok(new Date(trash.items[0].purgeAt) > new Date(trash.items[0].deletedAt));
  assert.equal(
    (await call("DELETE", `/api/trash/${pwId}`)).status,
    404,
    "live items cannot be purged",
  );
  assert.equal((await call("POST", `/api/trash/${x.json.id}/restore`)).json.title, "Temp");
  assert.equal((await call("GET", "/api/trash")).json.items.length, 0);

  await call("DELETE", `/api/items/${x.json.id}`);
  assert.equal((await call("DELETE", `/api/trash/${x.json.id}`)).status, 200);
  assert.equal(
    (await pool.query("SELECT 1 FROM password_items WHERE item_id = $1", [x.json.id])).rowCount,
    0,
  );

  const old = await call("POST", "/api/items/password", {
    title: "Old",
    password: "old-pass-1234567",
  });
  await call("DELETE", `/api/items/${old.json.id}`);
  await pool.query("UPDATE items SET deleted_at = now() - interval '31 days' WHERE id = $1", [
    old.json.id,
  ]);
  const enc = (await import("../../crypto/encryption.js")).EncryptionService;
  const { EnvKeyProvider } = await import("../../crypto/key-provider.js");
  const n = await purgeExpired(
    {
      pool,
      enc: new enc(new EnvKeyProvider(env.ENCRYPTION_KEY_VERSION, env.ENCRYPTION_KEY)),
      allowCvv: false,
    },
    30,
  );
  assert.equal(n, 1);
  assert.deepEqual(
    (await audit("RECORD_PURGED")).map((r: any) => r.item_label),
    ["Temp"],
  );
});

test("audit log never contains secrets, and is readable through the API", opts, async () => {
  const dump = JSON.stringify((await pool.query("SELECT * FROM audit_log")).rows);
  for (const s of [
    SECRET_PW,
    CARD,
    "9876",
    "router-pass-9",
    "recovery phone",
    "08/29",
    "brand-new-Pass-77!",
  ])
    assert.equal(dump.includes(s), false, s);
  const api = await call("GET", "/api/audit?limit=5");
  assert.equal(api.json.events.length, 5);
  assert.ok(api.json.events[0].type);
});
