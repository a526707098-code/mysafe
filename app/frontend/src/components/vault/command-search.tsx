"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as D from "@radix-ui/react-dialog";
import {
  CornerDownLeft,
  CreditCard,
  FileText,
  FolderOpen,
  KeyRound,
  Network,
  Search,
} from "lucide-react";
import { useVault, type VaultState } from "@/lib/vault-store";
import { hostOf } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { VaultItem } from "@/lib/types";
import { IconTile, type Tone } from "./icon-tile";

interface Hit {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  section: string;
  tone: Tone;
  icon: React.ReactNode;
}

/**
 * Search runs over non-secret metadata already in memory: titles, usernames,
 * URLs, device names, IPs, hostnames, categories, tags and notes. Encrypted
 * fields are never searchable and the query is never logged or sent anywhere.
 */
function searchVault(s: VaultState, raw: string): Hit[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const catName = (id?: string) => s.categories.find((c) => c.id === id)?.name ?? "";
  const matches = (item: VaultItem, ...extra: (string | undefined)[]) =>
    [item.title, catName(item.categoryId), ...item.tags, ...extra]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q));
  const link = (path: string, title: string) => `${path}?q=${encodeURIComponent(title)}`;

  return [
    ...s.passwords
      .filter((p) => matches(p, p.username, p.url, p.websiteName, p.notes))
      .map<Hit>((p) => ({
        id: p.id,
        title: p.title,
        subtitle: `${p.username} · ${hostOf(p.url)}`,
        href: link("/passwords", p.title),
        section: "סיסמאות",
        tone: "violet",
        icon: <KeyRound />,
      })),
    ...s.network
      .filter((n) =>
        matches(n, n.ip, n.hostname, n.deviceType, n.mac, n.location, n.notes, n.username),
      )
      .map<Hit>((n) => ({
        id: n.id,
        title: n.title,
        subtitle: `${n.ip}${n.hostname ? ` · ${n.hostname}` : ""}`,
        href: link("/network", n.title),
        section: "רשת",
        tone: "cyan",
        icon: <Network />,
      })),
    ...s.records
      .filter((r) =>
        matches(
          r,
          r.notes,
          ...r.fields.flatMap((f) => [f.name, f.sensitive ? undefined : f.value]),
        ),
      )
      .map<Hit>((r) => ({
        id: r.id,
        title: r.title,
        subtitle: `${r.fields.length} שדות`,
        href: link("/records", r.title),
        section: "רישומים",
        tone: "amber",
        icon: <FileText />,
      })),
    ...s.cards
      .filter((c) => matches(c, c.issuer, c.holder, c.last4))
      .map<Hit>((c) => ({
        id: c.id,
        title: c.title,
        subtitle: `${c.issuer} · •••• ${c.last4}`,
        href: link("/cards", c.title),
        section: "כרטיסים",
        tone: "rose",
        icon: <CreditCard />,
      })),
    ...s.documents
      .filter((d) => matches(d, d.description, d.relatedTo?.title))
      .map<Hit>((d) => ({
        id: d.id,
        title: d.title,
        subtitle: d.description ?? catName(d.categoryId),
        href: link("/documents", d.title),
        section: "מסמכים",
        tone: "blue",
        icon: <FolderOpen />,
      })),
  ].slice(0, 30);
}

export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const state = useVault((s) => s);
  const hits = useMemo(() => searchVault(state, q), [state, q]);
  const listRef = useRef<HTMLDivElement>(null);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    onOpenChange(false);
    setQ("");
    router.push(hit.href);
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <D.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setQ("");
      }}
    >
      <D.Portal>
        <D.Overlay className="bg-ink-950/75 fixed inset-0 z-50 backdrop-blur-sm" />
        <D.Content
          dir="rtl"
          className="glass-strong animate-scale-in fixed top-[8vh] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-3xl outline-none"
        >
          <D.Title className="sr-only">חיפוש בכספת</D.Title>
          <D.Description className="sr-only">
            חיפוש לפי כותרת, משתמש, כתובת, IP, תגית או קטגוריה
          </D.Description>
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-5">
            <Search className="text-brand-400 size-5" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, hits.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  go(hits[active]);
                }
              }}
              placeholder="חיפוש סיסמה, מכשיר, IP, תגית..."
              className="h-16 flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-500"
              autoComplete="off"
              spellCheck={false}
              aria-label="חיפוש"
            />
            <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-500 sm:block">
              Esc
            </kbd>
          </div>
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
            {q && hits.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                לא נמצאו תוצאות עבור “{q}”
              </p>
            ) : null}
            {!q ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                החיפוש פועל על מטא־דאטה בלבד. ערכים מוצפנים (סיסמאות, מספרי כרטיס, שדות רגישים) אינם
                ניתנים לחיפוש.
              </p>
            ) : null}
            {hits.map((hit, i) => (
              <button
                key={`${hit.section}-${hit.id}`}
                type="button"
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(hit)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition",
                  i === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                )}
              >
                <IconTile tone={hit.tone} size="sm">
                  {hit.icon}
                </IconTile>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{hit.title}</div>
                  <div className="truncate text-xs text-slate-400" dir="auto">
                    {hit.subtitle}
                  </div>
                </div>
                <span className="text-[11px] text-slate-500">{hit.section}</span>
                {i === active ? <CornerDownLeft className="size-4 text-slate-500" /> : null}
              </button>
            ))}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
