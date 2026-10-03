"use client";

/**
 * Client-side cache of NON-secret vault data. In the prototype it is seeded
 * from mock-data; after backend integration it is filled from the API. It is
 * wiped on lock. Decrypted secrets never enter this store: components hold a
 * revealed value in local state only for the few seconds it is on screen.
 */
import { useSyncExternalStore } from "react";
import * as mock from "./mock-data";
import type {
  AuditEvent,
  AuditEventType,
  BackupRun,
  CardItem,
  Category,
  DocumentItem,
  NetworkItem,
  PasswordItem,
  RecordItem,
  SectionKey,
  SessionInfo,
  TrashEntry,
  VaultItem,
} from "./types";

export interface VaultState {
  loaded: boolean;
  passwords: PasswordItem[];
  network: NetworkItem[];
  records: RecordItem[];
  cards: CardItem[];
  documents: DocumentItem[];
  categories: Category[];
  audit: AuditEvent[];
  sessions: SessionInfo[];
  backups: BackupRun[];
  trash: TrashEntry[];
  tags: string[];
}

const empty: VaultState = {
  loaded: false,
  passwords: [],
  network: [],
  records: [],
  cards: [],
  documents: [],
  categories: [],
  audit: [],
  sessions: [],
  backups: [],
  trash: [],
  tags: [],
};

let state: VaultState = empty;
const listeners = new Set<() => void>();

function set(next: Partial<VaultState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;

/** Snapshot is the (immutable) state object; selectors run after, so they may build new objects. */
export function useVault<T>(selector: (s: VaultState) => T): T {
  return selector(useSyncExternalStore(subscribe, snapshot, snapshot));
}

export const getVault = () => state;

let seq = 1000;
const nextId = (p: string) => `${p}${++seq}`;
const now = () => new Date().toISOString();

type ItemListKey = "passwords" | "network" | "records" | "cards" | "documents";
const kindToList: Record<VaultItem["kind"], ItemListKey> = {
  password: "passwords",
  network: "network",
  record: "records",
  card: "cards",
  document: "documents",
};

export const vault = {
  load() {
    if (state.loaded) return;
    set({
      loaded: true,
      passwords: structuredClone(mock.passwords),
      network: structuredClone(mock.network),
      records: structuredClone(mock.records),
      cards: structuredClone(mock.cards),
      documents: structuredClone(mock.documents),
      categories: structuredClone(mock.categories),
      audit: structuredClone(mock.auditEvents),
      sessions: structuredClone(mock.sessions),
      backups: structuredClone(mock.backups),
      trash: structuredClone(mock.trash),
      tags: [...mock.allTags],
    });
  },

  /** Lock: drop everything cached in memory. */
  clear() {
    state = empty;
    listeners.forEach((l) => l());
  },

  log(type: AuditEventType, recordRef?: string) {
    const event: AuditEvent = {
      id: nextId("a"),
      at: now(),
      type,
      recordRef,
      ip: "100.64.0.12",
      userAgent: "Prototype browser",
      sessionId: "s1",
    };
    set({ audit: [event, ...state.audit] });
  },

  toggleFavorite(item: VaultItem) {
    const key = kindToList[item.kind];
    const list = state[key] as VaultItem[];
    set({
      [key]: list.map((i) => (i.id === item.id ? { ...i, favorite: !i.favorite } : i)),
    } as Partial<VaultState>);
  },

  upsert<T extends VaultItem>(item: T) {
    const key = kindToList[item.kind];
    const list = state[key] as VaultItem[];
    const exists = list.some((i) => i.id === item.id);
    const stamped = { ...item, updatedAt: now() };
    set({
      [key]: exists ? list.map((i) => (i.id === item.id ? stamped : i)) : [stamped, ...list],
    } as Partial<VaultState>);
    vault.log(exists ? "RECORD_UPDATED" : "RECORD_CREATED", `${item.id} · ${item.title}`);
    return stamped;
  },

  newId: nextId,

  /** Soft delete: the item moves to Trash for the configured retention. */
  remove(item: VaultItem) {
    const key = kindToList[item.kind];
    const list = state[key] as VaultItem[];
    const retentionDays = 30;
    const entry: TrashEntry = {
      id: `t-${item.id}`,
      title: item.title,
      kind: key as SectionKey,
      deletedAt: now(),
      purgeAt: new Date(Date.now() + retentionDays * 86_400_000).toISOString(),
    };
    set({
      [key]: list.filter((i) => i.id !== item.id),
      trash: [entry, ...state.trash],
    } as Partial<VaultState>);
    vault.log("RECORD_DELETED", `${item.id} · ${item.title}`);
  },

  restore(id: string) {
    set({ trash: state.trash.filter((t) => t.id !== id) });
  },

  purge(id: string) {
    set({ trash: state.trash.filter((t) => t.id !== id) });
  },

  revokeSession(id: string) {
    set({ sessions: state.sessions.filter((s) => s.id !== id || s.current) });
  },

  revokeOtherSessions() {
    set({ sessions: state.sessions.filter((s) => s.current) });
  },

  upsertCategory(cat: Category) {
    const exists = state.categories.some((c) => c.id === cat.id);
    set({
      categories: exists
        ? state.categories.map((c) => (c.id === cat.id ? cat : c))
        : [...state.categories, cat],
    });
  },

  removeCategory(id: string) {
    set({ categories: state.categories.filter((c) => c.id !== id) });
  },

  async runBackup() {
    const run: BackupRun = {
      id: nextId("b"),
      startedAt: now(),
      kind: "manual",
      status: "running",
      dbBytes: 0,
      filesBytes: 0,
    };
    set({ backups: [run, ...state.backups] });
    vault.log("BACKUP_STARTED");
    await new Promise((r) => setTimeout(r, 2200));
    set({
      backups: state.backups.map((b) =>
        b.id === run.id
          ? {
              ...b,
              status: "success",
              finishedAt: now(),
              dbBytes: 4_810_000,
              filesBytes: 38_450_000,
            }
          : b,
      ),
    });
    vault.log("BACKUP_SUCCESS");
  },
};

export function categoryOf(id?: string) {
  return id ? state.categories.find((c) => c.id === id) : undefined;
}
