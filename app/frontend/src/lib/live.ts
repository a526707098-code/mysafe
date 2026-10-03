"use client";

/**
 * Live vault data: maps the backend's item API (docs/ARCHITECTURE.md) to the UI types.
 * Only used when NEXT_PUBLIC_MOCK_AUTH is not set.
 */
import { http } from "./auth-client";
import type {
  AuditEvent,
  AuditEventType,
  CardItem,
  Category,
  NetworkItem,
  PasswordItem,
  RecordItem,
  SessionInfo,
  TrashEntry,
  VaultItem,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isServerId = (id: string) => UUID.test(id);

/** Secrets typed in a form, held only until the save request that carries them. */
const staged = new Map<string, string>();
export const stageSecret = (id: string, value: string) => void staged.set(id, value);
export const discardStaged = () => staged.clear();

type Dto = Record<string, unknown> & { id: string; kind: string };

function toItem(d: Dto): VaultItem {
  const base = { ...d, tags: (d.tags as string[]) ?? [] };
  if (d.kind === "record") return { ...base, attachmentIds: [] } as unknown as RecordItem;
  if (d.kind === "card") return { ...base, attachmentIds: [] } as unknown as CardItem;
  return base as unknown as VaultItem;
}

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const url = (v: unknown) => (v === "https://" ? null : blankToNull(v));

function payload(item: VaultItem): Record<string, unknown> {
  const common = {
    title: item.title,
    categoryId: item.categoryId ?? null,
    tags: item.tags,
    favorite: item.favorite,
    notes: (item as { notes?: string }).notes ?? null,
  };
  const secret = staged.get(item.id);
  switch (item.kind) {
    case "password": {
      const p = item as PasswordItem;
      return {
        ...common,
        websiteName: p.websiteName,
        url: url(p.url),
        username: p.username,
        ...(secret ? { password: secret } : {}),
      };
    }
    case "network": {
      const n = item as NetworkItem;
      return {
        ...common,
        deviceType: n.deviceType,
        ip: blankToNull(n.ip),
        hostname: n.hostname ?? "",
        managementUrl: url(n.managementUrl),
        port: n.port ?? null,
        username: n.username ?? "",
        location: n.location ?? "",
        mac: blankToNull(n.mac),
        vlan: n.vlan ?? "",
        ...(secret ? { password: secret } : {}),
      };
    }
    case "record": {
      const r = item as RecordItem;
      return {
        ...common,
        fields: r.fields.map((f) => ({
          ...(isServerId(f.id) ? { id: f.id } : {}),
          name: f.name,
          sensitive: f.sensitive,
          ...(f.sensitive
            ? staged.has(f.id)
              ? { value: staged.get(f.id) }
              : {}
            : { value: f.value ?? "" }),
        })),
      };
    }
    case "card": {
      const c = item as CardItem;
      const [number, expiry] = (secret ?? "").split("|");
      return {
        ...common,
        holder: c.holder,
        issuer: c.issuer,
        brand: c.brand,
        gradient: c.gradient,
        ...(number ? { number: number.replace(/\s/g, "") } : {}),
        ...(expiry ? { expiry } : {}),
      };
    }
    default:
      throw new Error("unsupported kind");
  }
}

export async function saveItem(item: VaultItem, exists: boolean): Promise<VaultItem> {
  const body = payload(item);
  const saved = exists
    ? await http<Dto>("PUT", `/api/items/${item.id}`, body)
    : await http<Dto>("POST", `/api/items/${item.kind}`, body);
  // The draft's secrets are on the server now; do not keep them around.
  for (const key of [
    item.id,
    ...(item.kind === "record" ? (item as RecordItem).fields.map((f) => f.id) : []),
  ])
    staged.delete(key);
  return toItem(saved);
}

const parseUa = (ua: string) => {
  const browser = /Edg\/([\d.]+)/.exec(ua)
    ? "Edge"
    : /Firefox\/([\d.]+)/.exec(ua)
      ? "Firefox"
      : /Chrome\/([\d.]+)/.exec(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "דפדפן";
  const device = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "מכשיר";
  return { device, browser };
};

export interface LiveSnapshot {
  items: VaultItem[];
  categories: Category[];
  tags: string[];
  trash: TrashEntry[];
  audit: AuditEvent[];
  sessions: SessionInfo[];
  retentionDays: number;
}

export async function fetchSnapshot(): Promise<LiveSnapshot> {
  const [items, categories, tags, trash, audit, sessions] = await Promise.all([
    http<{ items: Dto[] }>("GET", "/api/items?withNotes=true"),
    http<{ categories: Category[] }>("GET", "/api/categories"),
    http<{ tags: string[] }>("GET", "/api/tags"),
    http<{ items: TrashEntry[]; retentionDays: number }>("GET", "/api/trash"),
    http<{ events: Array<Record<string, string>> }>("GET", "/api/audit?limit=200"),
    http<{ sessions: Array<Record<string, string | boolean>> }>("GET", "/api/sessions"),
  ]);
  return {
    items: items.items.map(toItem),
    categories: categories.categories.map((c) => ({ ...c, color: c.color ?? "#64748b" })),
    tags: tags.tags,
    trash: trash.items.map((t) => ({ ...t, kind: toSection(t.kind as string) })),
    retentionDays: trash.retentionDays,
    audit: audit.events.map((e) => ({
      id: e.id as string,
      at: e.at as string,
      type: e.type as AuditEventType,
      recordRef: e.recordRef,
      ip: e.ip as string,
      userAgent: e.userAgent as string,
      sessionId: e.sessionId as string,
    })),
    sessions: sessions.sessions.map((s) => ({
      id: s.id as string,
      ...parseUa((s.userAgent as string) ?? ""),
      ip: (s.ip as string) ?? "",
      createdAt: s.createdAt as string,
      lastActiveAt: s.lastSeenAt as string,
      current: Boolean(s.current),
    })),
  };
}

const SECTION: Record<string, TrashEntry["kind"]> = {
  password: "passwords",
  network: "network",
  record: "records",
  card: "cards",
  document: "documents",
};
const toSection = (kind: string) => SECTION[kind] ?? "records";

export const live = {
  favorite: (id: string, favorite: boolean) =>
    http("POST", `/api/items/${id}/favorite`, { favorite }),
  remove: (id: string) => http("DELETE", `/api/items/${id}`),
  restore: (id: string) => http("POST", `/api/trash/${id}/restore`, {}),
  purge: (id: string) => http("DELETE", `/api/trash/${id}`),
  saveCategory: (c: Category) => {
    const body = {
      name: c.name,
      icon: c.icon,
      color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : null,
      description: c.description || null,
      section: c.section,
    };
    return isServerId(c.id)
      ? http<Category>("PUT", `/api/categories/${c.id}`, body)
      : http<Category>("POST", "/api/categories", body);
  },
  removeCategory: (id: string) => http("DELETE", `/api/categories/${id}`),
  revokeSession: (id: string) => http("DELETE", `/api/sessions/${id}`),
  revokeOthers: () => http("POST", "/api/sessions/revoke-others", {}),
  reveal: async (itemId: string, field: string, purpose: "view" | "copy") =>
    (await http<{ value: string }>("POST", `/api/items/${itemId}/reveal`, { field, purpose }))
      .value,
};
