import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { encryptionContext as ctx, type EncryptionService } from "../../crypto/encryption.js";
import { passwordStrength } from "./strength.js";
import type { ItemKind } from "./schemas.js";

export class ItemError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const notFound = () => new ItemError(404, "לא נמצא");

export interface Deps {
  pool: Pool;
  enc: EncryptionService;
  allowCvv: boolean;
}

type Json = Record<string, unknown>;

// ---------------------------------------------------------------- reading

const SELECT = `
SELECT i.id, i.kind, i.title, i.category_id, i.favorite, i.created_at, i.updated_at, i.deleted_at,
       (i.notes_enc IS NOT NULL) AS has_notes,
       COALESCE(ARRAY(SELECT t.name::text FROM item_tags it JOIN tags t ON t.id = it.tag_id
                       WHERE it.item_id = i.id ORDER BY t.name), '{}') AS tags,
       p.website_name, p.url, p.username AS p_user, p.strength,
       n.device_type, n.ip::text AS n_ip, n.hostname, n.management_url, n.port,
       n.username AS n_user, (n.password_enc IS NOT NULL) AS n_has_pw, n.location,
       n.mac::text AS n_mac, n.vlan,
       c.holder, c.issuer, c.brand, c.last4, c.gradient, (c.expiry_enc IS NOT NULL) AS c_has_exp
  FROM items i
  LEFT JOIN password_items p ON p.item_id = i.id
  LEFT JOIN network_items  n ON n.item_id = i.id
  LEFT JOIN card_items     c ON c.item_id = i.id`;

interface Row {
  id: string;
  kind: ItemKind | "document";
  title: string;
  category_id: string | null;
  favorite: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  has_notes: boolean;
  tags: string[];
  [k: string]: unknown;
}

const opt = (v: unknown) => (v === null || v === undefined ? undefined : v);

function toDto(r: Row, fields: Json[] | undefined): Json {
  const base: Json = {
    id: r.id,
    kind: r.kind,
    title: r.title,
    categoryId: opt(r.category_id),
    tags: r.tags,
    favorite: r.favorite,
    hasNotes: r.has_notes,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
  switch (r.kind) {
    case "password":
      return {
        ...base,
        websiteName: r.website_name ?? "",
        url: r.url ?? "",
        username: r.p_user ?? "",
        strength: r.strength ?? "weak",
      };
    case "network":
      return {
        ...base,
        deviceType: r.device_type,
        ip: r.n_ip ? String(r.n_ip).replace(/\/\d+$/, "") : "",
        hostname: opt(r.hostname),
        managementUrl: opt(r.management_url),
        port: opt(r.port),
        username: opt(r.n_user),
        hasPassword: r.n_has_pw,
        location: opt(r.location),
        mac: opt(r.n_mac),
        vlan: opt(r.vlan),
      };
    case "record":
      return { ...base, fields: fields ?? [] };
    case "card":
      return {
        ...base,
        holder: r.holder ?? "",
        issuer: r.issuer ?? "",
        brand: r.brand ?? "other",
        last4: r.last4,
        gradient: r.gradient ?? "slate",
        hasExpiry: r.c_has_exp,
      };
    default:
      return base;
  }
}

/** Non-sensitive field values only: sensitive values never leave via lists or details. */
async function loadFields(db: Pool | PoolClient, itemIds: string[]): Promise<Map<string, Json[]>> {
  const out = new Map<string, Json[]>();
  if (!itemIds.length) return out;
  const { rows } = await db.query(
    `SELECT id, item_id, name, sensitive, value FROM record_fields
      WHERE item_id = ANY($1::uuid[]) ORDER BY item_id, position`,
    [itemIds],
  );
  for (const f of rows) {
    const list = out.get(f.item_id) ?? [];
    list.push({
      id: f.id,
      name: f.name,
      sensitive: f.sensitive,
      ...(f.sensitive ? {} : { value: f.value ?? "" }),
    });
    out.set(f.item_id, list);
  }
  return out;
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ListFilter {
  kind?: ItemKind;
  favorite?: boolean;
  categoryId?: string;
  tag?: string;
  q?: string;
  trash?: boolean;
  limit?: number;
}

export async function listItems(d: Deps, f: ListFilter = {}): Promise<Json[]> {
  const where: string[] = [f.trash ? "i.deleted_at IS NOT NULL" : "i.deleted_at IS NULL"];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.kind) where.push(`i.kind = ${p(f.kind)}`);
  if (f.favorite) where.push("i.favorite");
  if (f.categoryId) where.push(`i.category_id = ${p(f.categoryId)}`);
  if (f.tag)
    where.push(
      `EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id AND t.name = ${p(f.tag)})`,
    );
  if (f.q?.trim()) {
    // Metadata only: encrypted columns (passwords, notes, sensitive fields) are not searchable.
    const like = p(`%${likeEscape(f.q.trim())}%`);
    const cols = [
      "i.title",
      "p.website_name",
      "p.url",
      "p.username",
      "n.hostname",
      "n.ip::text",
      "n.management_url",
      "n.username",
      "n.location",
      "n.vlan",
      "n.mac::text",
      "c.holder",
      "c.issuer",
      "c.last4",
    ].map((c) => `${c} ILIKE ${like}`);
    cols.push(
      `EXISTS (SELECT 1 FROM categories cat WHERE cat.id = i.category_id AND cat.name ILIKE ${like})`,
      `EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id AND t.name ILIKE ${like})`,
      `EXISTS (SELECT 1 FROM record_fields rf WHERE rf.item_id = i.id AND (rf.name ILIKE ${like} OR (NOT rf.sensitive AND rf.value ILIKE ${like})))`,
    );
    where.push(`(${cols.join(" OR ")})`);
  }
  const limit = Math.min(Math.max(f.limit ?? 500, 1), 1000);
  const order = f.trash ? "i.deleted_at DESC" : "i.updated_at DESC";
  const { rows } = await d.pool.query<Row>(
    `${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit}`,
    params,
  );
  const fields = await loadFields(
    d.pool,
    rows.filter((r) => r.kind === "record").map((r) => r.id),
  );
  return rows.map((r) => toDto(r, fields.get(r.id)));
}

async function getRow(db: Pool | PoolClient, id: string, includeDeleted = false) {
  const { rows } = await db.query<Row>(
    `${SELECT} WHERE i.id = $1 ${includeDeleted ? "" : "AND i.deleted_at IS NULL"}`,
    [id],
  );
  return rows[0];
}

export async function getItem(d: Deps, id: string): Promise<Json> {
  const row = await getRow(d.pool, id);
  if (!row) throw notFound();
  const fields = row.kind === "record" ? (await loadFields(d.pool, [id])).get(id) : undefined;
  const dto = toDto(row, fields);
  const n = await d.pool.query<{ notes_enc: Buffer | null }>(
    "SELECT notes_enc FROM items WHERE id = $1",
    [id],
  );
  const enc = n.rows[0]?.notes_enc;
  if (enc) dto.notes = d.enc.decryptString(enc, ctx("items", "notes", id));
  return dto;
}

// ---------------------------------------------------------------- writing

async function tx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function setTags(c: PoolClient, itemId: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  await c.query("DELETE FROM item_tags WHERE item_id = $1", [itemId]);
  for (const name of unique) {
    const t = await c.query<{ id: string }>(
      `INSERT INTO tags(name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = tags.name RETURNING id`,
      [name],
    );
    await c.query("INSERT INTO item_tags(item_id, tag_id) VALUES ($1,$2)", [itemId, t.rows[0]?.id]);
  }
  await c.query(
    "DELETE FROM tags t WHERE NOT EXISTS (SELECT 1 FROM item_tags it WHERE it.tag_id = t.id)",
  );
}

async function checkCategory(c: PoolClient, id: string | null | undefined) {
  if (!id) return;
  const r = await c.query("SELECT 1 FROM categories WHERE id = $1", [id]);
  if (r.rowCount !== 1) throw new ItemError(422, "הקטגוריה לא קיימת");
}

const enc = (d: Deps, v: string, table: string, col: string, id: string) =>
  d.enc.encrypt(v, ctx(table, col, id));

async function writeFields(
  d: Deps,
  c: PoolClient,
  itemId: string,
  fields: { id?: string; name: string; sensitive: boolean; value?: string }[],
) {
  const existing = new Map(
    (
      await c.query<{
        id: string;
        sensitive: boolean;
        value: string | null;
        value_enc: Buffer | null;
      }>("SELECT id, sensitive, value, value_enc FROM record_fields WHERE item_id = $1", [itemId])
    ).rows.map((r) => [r.id, r]),
  );
  await c.query("DELETE FROM record_fields WHERE item_id = $1", [itemId]);
  let position = 0;
  for (const f of fields) {
    const old = f.id ? existing.get(f.id) : undefined;
    // A client-supplied id is only honoured if it belonged to this item; otherwise a fresh one.
    const id = old ? (f.id as string) : randomUUID();
    if (f.sensitive) {
      // Omitted value on an existing field keeps its ciphertext (same id, so the AAD still matches).
      const keep = f.value === undefined && old?.sensitive ? old.value_enc : null;
      if (f.value === undefined && !keep) throw new ItemError(422, `חסר ערך לשדה "${f.name}"`);
      const valueEnc = f.value !== undefined ? enc(d, f.value, "record_fields", "value", id) : keep;
      await c.query(
        `INSERT INTO record_fields(id, item_id, position, name, sensitive, value, value_enc)
         VALUES ($1,$2,$3,$4,true,NULL,$5)`,
        [id, itemId, position++, f.name, valueEnc],
      );
    } else {
      const value = f.value ?? (old && !old.sensitive ? old.value : "") ?? "";
      await c.query(
        `INSERT INTO record_fields(id, item_id, position, name, sensitive, value, value_enc)
         VALUES ($1,$2,$3,$4,false,$5,NULL)`,
        [id, itemId, position++, f.name, value],
      );
    }
  }
}

type Body = Record<string, unknown> & { tags?: string[]; notes?: string | null };

async function writeDetail(
  d: Deps,
  c: PoolClient,
  kind: ItemKind,
  id: string,
  b: Body,
  creating: boolean,
) {
  const has = (k: string) => b[k] !== undefined;
  const set = async (table: string, cols: Record<string, unknown>) => {
    const keys = Object.keys(cols).filter((k) => cols[k] !== undefined);
    if (creating) {
      const names = ["item_id", ...keys];
      await c.query(
        `INSERT INTO ${table}(${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`,
        [id, ...keys.map((k) => cols[k])],
      );
    } else if (keys.length) {
      await c.query(
        `UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(",")} WHERE item_id = $1`,
        [id, ...keys.map((k) => cols[k])],
      );
    }
  };
  const nul = (k: string) => (has(k) ? (b[k] ?? null) : undefined);

  if (kind === "password") {
    const pw = b.password as string | undefined;
    await set("password_items", {
      website_name: nul("websiteName"),
      url: nul("url"),
      username: nul("username"),
      password_enc: pw === undefined ? undefined : enc(d, pw, "password_items", "password", id),
      strength: pw === undefined ? undefined : passwordStrength(pw),
    });
  } else if (kind === "network") {
    const pw = b.password as string | undefined;
    await set("network_items", {
      device_type: b.deviceType,
      ip: nul("ip"),
      hostname: nul("hostname"),
      management_url: nul("managementUrl"),
      port: nul("port"),
      username: nul("username"),
      password_enc: pw === undefined ? undefined : enc(d, pw, "network_items", "password", id),
      location: nul("location"),
      mac: nul("mac"),
      vlan: nul("vlan"),
    });
  } else if (kind === "card") {
    if (b.cvv !== undefined && !d.allowCvv)
      throw new ItemError(422, "שמירת CVV מושבתת בהגדרות השרת");
    const number = b.number as string | undefined;
    await set("card_items", {
      holder: nul("holder"),
      issuer: nul("issuer"),
      brand: b.brand,
      gradient: b.gradient,
      // last4 is derived from the number on the server, never taken from the client.
      last4: number === undefined ? undefined : number.slice(-4),
      number_enc: number === undefined ? undefined : enc(d, number, "card_items", "number", id),
      expiry_enc: has("expiry")
        ? enc(d, b.expiry as string, "card_items", "expiry", id)
        : undefined,
      cvv_enc: has("cvv") ? enc(d, b.cvv as string, "card_items", "cvv", id) : undefined,
    });
  } else if (kind === "record" && b.fields !== undefined) {
    await writeFields(d, c, id, b.fields as never);
  }
}

export interface Actor {
  /** For the audit trail only. */
  label: (
    event:
      "RECORD_CREATED" | "RECORD_UPDATED" | "RECORD_DELETED" | "RECORD_RESTORED" | "RECORD_PURGED",
    id: string,
    title: string,
  ) => Promise<void>;
}

export async function createItem(d: Deps, kind: ItemKind, b: Body, actor: Actor): Promise<Json> {
  const id = randomUUID();
  await tx(d.pool, async (c) => {
    await checkCategory(c, b.categoryId as string | null | undefined);
    await c.query(
      `INSERT INTO items(id, kind, title, category_id, favorite) VALUES ($1,$2,$3,$4,$5)`,
      [id, kind, b.title, b.categoryId ?? null, b.favorite ?? false],
    );
    if (b.notes)
      await c.query("UPDATE items SET notes_enc = $2 WHERE id = $1", [
        id,
        enc(d, b.notes, "items", "notes", id),
      ]);
    await writeDetail(d, c, kind, id, b, true);
    await setTags(c, id, b.tags ?? []);
  });
  await actor.label("RECORD_CREATED", id, b.title as string);
  return getItem(d, id);
}

export async function updateItem(
  d: Deps,
  id: string,
  b: Body,
  actor: Actor,
  kind?: ItemKind,
): Promise<Json> {
  const row = await getRow(d.pool, id);
  if (!row || row.kind === "document") throw notFound();
  if (kind && kind !== row.kind) throw new ItemError(422, "סוג הרשומה אינו ניתן לשינוי");
  await tx(d.pool, async (c) => {
    await checkCategory(c, b.categoryId as string | null | undefined);
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [id];
    const add = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (b.title !== undefined) add("title", b.title);
    if (b.categoryId !== undefined) add("category_id", b.categoryId);
    if (b.favorite !== undefined) add("favorite", b.favorite);
    if (b.notes !== undefined)
      add("notes_enc", b.notes ? enc(d, b.notes, "items", "notes", id) : null);
    await c.query(`UPDATE items SET ${sets.join(",")} WHERE id = $1`, vals);
    await writeDetail(d, c, row.kind as ItemKind, id, b, false);
    if (b.tags !== undefined) await setTags(c, id, b.tags);
  });
  await actor.label("RECORD_UPDATED", id, (b.title as string | undefined) ?? row.title);
  return getItem(d, id);
}

export async function setFavorite(d: Deps, id: string, favorite: boolean): Promise<void> {
  // Favoriting is a UI preference, not a content change: updated_at is left alone.
  const r = await d.pool.query(
    "UPDATE items SET favorite = $2 WHERE id = $1 AND deleted_at IS NULL",
    [id, favorite],
  );
  if (r.rowCount !== 1) throw notFound();
}

// ---------------------------------------------------------------- trash

export async function trashItem(d: Deps, id: string, actor: Actor): Promise<void> {
  const row = await getRow(d.pool, id);
  if (!row) throw notFound();
  await d.pool.query("UPDATE items SET deleted_at = now() WHERE id = $1", [id]);
  await actor.label("RECORD_DELETED", id, row.title);
}

export async function restoreItem(d: Deps, id: string, actor: Actor): Promise<Json> {
  const row = await getRow(d.pool, id, true);
  if (!row?.deleted_at) throw notFound();
  await d.pool.query("UPDATE items SET deleted_at = NULL WHERE id = $1", [id]);
  await actor.label("RECORD_RESTORED", id, row.title);
  return getItem(d, id);
}

export async function purgeItem(d: Deps, id: string, actor: Actor): Promise<void> {
  const row = await getRow(d.pool, id, true);
  if (!row?.deleted_at) throw notFound(); // only items already in the trash can be purged
  await d.pool.query("DELETE FROM items WHERE id = $1", [id]); // cascades to the ciphertext rows
  await actor.label("RECORD_PURGED", id, row.title);
}

/** Housekeeping: permanently remove items that have been in the trash past the retention period. */
export async function purgeExpired(d: Deps, retentionDays: number): Promise<number> {
  const r = await d.pool.query(
    "DELETE FROM items WHERE deleted_at < now() - make_interval(days => $1)",
    [retentionDays],
  );
  return r.rowCount ?? 0;
}

// ---------------------------------------------------------------- secrets

export type RevealField = { table: string; column: string; event: "PASSWORD" | "CARD" };

/** Decrypts exactly one named secret. The route audits it; nothing else decrypts on request. */
export async function revealSecret(
  d: Deps,
  id: string,
  field: string,
): Promise<{ value: string; event: "PASSWORD" | "CARD"; title: string }> {
  const row = await getRow(d.pool, id);
  if (!row) throw notFound();
  const pick = async (
    sql: string,
    params: unknown[],
    table: string,
    column: string,
    rowId: string,
    event: "PASSWORD" | "CARD",
  ) => {
    const r = await d.pool.query<{ v: Buffer | null }>(sql, params);
    const v = r.rows[0]?.v;
    if (!v) throw notFound();
    return { value: d.enc.decryptString(v, ctx(table, column, rowId)), event, title: row.title };
  };
  if (field === "password" && row.kind === "password")
    return pick(
      "SELECT password_enc AS v FROM password_items WHERE item_id = $1",
      [id],
      "password_items",
      "password",
      id,
      "PASSWORD",
    );
  if (field === "password" && row.kind === "network")
    return pick(
      "SELECT password_enc AS v FROM network_items WHERE item_id = $1",
      [id],
      "network_items",
      "password",
      id,
      "PASSWORD",
    );
  if (row.kind === "card" && (field === "number" || field === "expiry" || field === "cvv")) {
    const col = `${field}_enc`;
    return pick(
      `SELECT ${col} AS v FROM card_items WHERE item_id = $1`,
      [id],
      "card_items",
      field,
      id,
      "CARD",
    );
  }
  if (field === "notes")
    return pick(
      "SELECT notes_enc AS v FROM items WHERE id = $1",
      [id],
      "items",
      "notes",
      id,
      "PASSWORD",
    );
  const m = /^field:([0-9a-f-]{36})$/.exec(field);
  if (m && row.kind === "record")
    return pick(
      "SELECT value_enc AS v FROM record_fields WHERE id = $1 AND item_id = $2 AND sensitive",
      [m[1], id],
      "record_fields",
      "value",
      m[1] as string,
      "PASSWORD",
    );
  throw notFound();
}

// ---------------------------------------------------------------- categories & tags

export interface CategoryInput {
  name: string;
  icon: string;
  color?: string | null;
  description?: string | null;
  section: string;
}

const catDto = (r: Json) => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  color: r.color ?? undefined,
  description: r.description ?? undefined,
  section: r.section,
});

export async function listCategories(d: Deps) {
  const { rows } = await d.pool.query("SELECT * FROM categories ORDER BY name");
  return rows.map(catDto);
}

export async function createCategory(d: Deps, b: CategoryInput) {
  try {
    const { rows } = await d.pool.query(
      `INSERT INTO categories(name, icon, color, description, section) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.name, b.icon, b.color ?? null, b.description ?? null, b.section],
    );
    return catDto(rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new ItemError(409, "קטגוריה בשם זה כבר קיימת");
    throw e;
  }
}

export async function updateCategory(d: Deps, id: string, b: CategoryInput) {
  try {
    const { rows } = await d.pool.query(
      `UPDATE categories SET name=$2, icon=$3, color=$4, description=$5, section=$6 WHERE id=$1 RETURNING *`,
      [id, b.name, b.icon, b.color ?? null, b.description ?? null, b.section],
    );
    if (!rows[0]) throw notFound();
    return catDto(rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new ItemError(409, "קטגוריה בשם זה כבר קיימת");
    throw e;
  }
}

export async function deleteCategory(d: Deps, id: string) {
  // Items keep existing: their category_id is set to NULL by the foreign key.
  const r = await d.pool.query("DELETE FROM categories WHERE id = $1", [id]);
  if (r.rowCount !== 1) throw notFound();
}

export async function listTags(d: Deps): Promise<string[]> {
  const { rows } = await d.pool.query<{ name: string }>(
    "SELECT name::text AS name FROM tags ORDER BY name",
  );
  return rows.map((r) => r.name);
}

export async function listAudit(d: Deps, limit: number) {
  const { rows } = await d.pool.query(
    `SELECT id, at, event_type, item_id, item_label, ip::text AS ip, user_agent, session_id
       FROM audit_log ORDER BY at DESC, id DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    at: r.at.toISOString(),
    type: r.event_type,
    itemId: r.item_id ?? undefined,
    recordRef: r.item_label ?? undefined,
    ip: r.ip ?? "",
    userAgent: r.user_agent ?? "",
    sessionId: r.session_id ?? "",
  }));
}
