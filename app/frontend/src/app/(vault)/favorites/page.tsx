"use client";
import Link from "next/link";
import { CreditCard, FileText, FolderOpen, KeyRound, Network, Star } from "lucide-react";
import { useVault } from "@/lib/vault-store";
import { hostOf, maskedCard, relativeTime } from "@/lib/format";
import type { VaultItem } from "@/lib/types";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile, type Tone } from "@/components/vault/icon-tile";
import { FavoriteButton, PageHeader, TagChips } from "@/components/vault/bits";
import { SecretField } from "@/components/vault/secret";

const META: Record<
  VaultItem["kind"],
  { tone: Tone; icon: React.ReactNode; href: string; label: string }
> = {
  password: { tone: "violet", icon: <KeyRound />, href: "/passwords", label: "סיסמאות" },
  network: { tone: "cyan", icon: <Network />, href: "/network", label: "רשת ושרתים" },
  record: { tone: "amber", icon: <FileText />, href: "/records", label: "רישומים" },
  card: { tone: "rose", icon: <CreditCard />, href: "/cards", label: "כרטיסים" },
  document: { tone: "blue", icon: <FolderOpen />, href: "/documents", label: "מסמכים" },
};

function subtitle(i: VaultItem) {
  switch (i.kind) {
    case "password":
      return `${i.username} · ${hostOf(i.url)}`;
    case "network":
      return `${i.ip}${i.hostname ? ` · ${i.hostname}` : ""}`;
    case "record":
      return `${i.fields.length} שדות`;
    case "card":
      return `${i.issuer} · ${maskedCard(i.last4)}`;
    case "document":
      return i.description ?? i.mime;
  }
}

export default function FavoritesPage() {
  const s = useVault((x) => x);
  const all: VaultItem[] = [
    ...s.passwords,
    ...s.network,
    ...s.records,
    ...s.cards,
    ...s.documents,
  ].filter((i) => i.favorite);
  const groups = (Object.keys(META) as VaultItem["kind"][])
    .map((k) => ({ kind: k, items: all.filter((i) => i.kind === k) }))
    .filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        title="מועדפים"
        subtitle={`${all.length} פריטים מכל האזורים`}
        tone="yellow"
        icon={<Star />}
      />
      {all.length === 0 ? (
        <EmptyState
          icon={
            <IconTile tone="yellow" size="xl">
              <Star />
            </IconTile>
          }
          title="אין עדיין מועדפים"
          description="סמן כוכב על כל פריט — סיסמה, מכשיר, רישום, כרטיס או מסמך — כדי להגיע אליו מכאן במהירות."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.kind}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <IconTile tone={META[g.kind].tone} size="sm">
                  {META[g.kind].icon}
                </IconTile>
                {META[g.kind].label}
                <span className="text-xs font-normal text-slate-500">{g.items.length}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map((i) => (
                  <article
                    key={i.id}
                    className="glass rounded-3xl p-4 transition hover:border-white/15"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`${META[i.kind].href}?q=${encodeURIComponent(i.title)}`}
                          className="hover:text-brand-200 block truncate font-semibold text-white"
                        >
                          {i.title}
                        </Link>
                        <div className="truncate text-xs text-slate-500" dir="auto">
                          {subtitle(i)}
                        </div>
                      </div>
                      <FavoriteButton item={i} />
                    </div>
                    {i.kind === "password" || (i.kind === "network" && i.username) ? (
                      <SecretField
                        kind={i.kind}
                        id={i.id}
                        label={i.title}
                        compact
                        className="mt-3"
                      />
                    ) : null}
                    <div className="mt-3 flex items-center justify-between">
                      <TagChips tags={i.tags} />
                      <span className="text-[11px] text-slate-500">
                        {relativeTime(i.updatedAt)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
