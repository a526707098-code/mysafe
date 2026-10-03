"use client";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  DatabaseBackup,
  FileText,
  FolderOpen,
  KeyRound,
  LogIn,
  Network,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Upload,
  XCircle,
} from "lucide-react";
import { useVault } from "@/lib/vault-store";
import { useSession } from "@/lib/session";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { VaultItem } from "@/lib/types";
import { IconTile, type Tone } from "@/components/vault/icon-tile";
import { Badge } from "@/components/ui/badge";

const SECTION_META: Record<
  VaultItem["kind"],
  { tone: Tone; icon: React.ReactNode; href: string; label: string }
> = {
  password: { tone: "violet", icon: <KeyRound />, href: "/passwords", label: "סיסמה" },
  network: { tone: "cyan", icon: <Network />, href: "/network", label: "רשת" },
  record: { tone: "amber", icon: <FileText />, href: "/records", label: "רישום" },
  card: { tone: "rose", icon: <CreditCard />, href: "/cards", label: "כרטיס" },
  document: { tone: "blue", icon: <FolderOpen />, href: "/documents", label: "מסמך" },
};

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass rounded-4xl p-5 sm:p-6", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ItemRow({ item, when }: { item: VaultItem; when: string }) {
  const meta = SECTION_META[item.kind];
  return (
    <Link
      href={`${meta.href}?q=${encodeURIComponent(item.title)}`}
      className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/[0.04]"
    >
      <IconTile tone={meta.tone} size="sm">
        {meta.icon}
      </IconTile>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-100">{item.title}</div>
        <div className="text-xs text-slate-500">
          {meta.label} · {relativeTime(when)}
        </div>
      </div>
      {item.favorite ? <Star className="size-4 fill-yellow-400 text-yellow-400" /> : null}
      <ArrowLeft className="size-4 text-slate-600 opacity-0 transition group-hover:opacity-100" />
    </Link>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
      <defs>
        <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="7" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="url(#ring)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
      />
    </svg>
  );
}

export default function DashboardPage() {
  const s = useVault((x) => x);
  const { username, idleMinutes } = useSession();
  const all: VaultItem[] = [...s.passwords, ...s.network, ...s.records, ...s.cards, ...s.documents];
  const favorites = all.filter((i) => i.favorite);
  const recentlyUpdated = [...all]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const recentlyCreated = [...all]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const weak = s.passwords.filter((p) => p.strength === "weak").length;
  const lastBackup = s.backups.find((b) => b.status === "success");
  const lastBackupFailed = s.backups[0]?.status === "failed";
  const logins = s.audit
    .filter((a) => a.type === "LOGIN_SUCCESS" || a.type === "LOGIN_FAILED")
    .slice(0, 4);
  const score = Math.max(0, 100 - weak * 8 - (lastBackupFailed ? 15 : 0));

  const stats = [
    {
      label: "סיסמאות",
      value: s.passwords.length,
      href: "/passwords",
      tone: "violet" as Tone,
      icon: <KeyRound />,
      hint: `${weak} חלשות`,
    },
    {
      label: "ציוד רשת",
      value: s.network.length,
      href: "/network",
      tone: "cyan" as Tone,
      icon: <Network />,
      hint: `${s.network.filter((n) => n.online).length} מקוונים`,
    },
    {
      label: "רישומים",
      value: s.records.length,
      href: "/records",
      tone: "amber" as Tone,
      icon: <FileText />,
      hint: `${s.records.reduce((n, r) => n + r.fields.filter((f) => f.sensitive).length, 0)} שדות רגישים`,
    },
    {
      label: "כרטיסים",
      value: s.cards.length,
      href: "/cards",
      tone: "rose" as Tone,
      icon: <CreditCard />,
      hint: "מוצפנים",
    },
    {
      label: "מסמכים",
      value: s.documents.length,
      href: "/documents",
      tone: "blue" as Tone,
      icon: <FolderOpen />,
      hint: formatBytes(s.documents.reduce((n, d) => n + d.sizeBytes, 0)),
    },
    {
      label: "מועדפים",
      value: favorites.length,
      href: "/favorites",
      tone: "yellow" as Tone,
      icon: <Star />,
      hint: "מכל האזורים",
    },
  ];

  const quick = [
    {
      label: "סיסמה חדשה",
      desc: "אתר, משתמש וסיסמה מוצפנת",
      href: "/passwords?new=1",
      tone: "violet" as Tone,
      icon: <KeyRound />,
    },
    {
      label: "ציוד רשת",
      desc: "נתב, NAS, שרת או מצלמה",
      href: "/network?new=1",
      tone: "cyan" as Tone,
      icon: <Network />,
    },
    {
      label: "רישום חדש",
      desc: "שדות חופשיים ורגישים",
      href: "/records?new=1",
      tone: "amber" as Tone,
      icon: <FileText />,
    },
    {
      label: "מסמך",
      desc: "צילום מהמצלמה או PDF",
      href: "/documents?new=1",
      tone: "blue" as Tone,
      icon: <Upload />,
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Hero */}
      <section className="from-accent-500/[0.12] to-brand-500/[0.1] relative overflow-hidden rounded-4xl border border-white/[0.07] bg-gradient-to-l via-white/[0.03] p-6 sm:p-8">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="bg-brand-500/20 pointer-events-none absolute -top-24 -left-16 size-72 rounded-full blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Sparkles className="text-brand-300 size-4" />{" "}
              {formatDateTime(new Date().toISOString()).split(",")[0]}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              שלום
              {username ? (
                <>
                  , <span className="text-gradient ltr">{username}</span>
                </>
              ) : null}
            </h1>
            <p className="mt-1 text-slate-400">הכספת הפרטית שלך</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2 text-sm text-emerald-200">
              <span className="animate-pulse-ring size-2 rounded-full bg-emerald-400" /> כספת
              מאובטחת
            </span>
            <span className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-slate-200">
              <ShieldCheck className="size-4 text-emerald-400" /> 2FA:{" "}
              <strong className="text-emerald-300">פעיל</strong>
            </span>
            <span className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-slate-200">
              <DatabaseBackup
                className={cn("size-4", lastBackupFailed ? "text-rose-400" : "text-emerald-400")}
              />{" "}
              גיבוי:{" "}
              <strong className={lastBackupFailed ? "text-rose-300" : "text-emerald-300"}>
                {lastBackupFailed ? "נכשל" : "תקין"}
              </strong>
            </span>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((st) => (
          <Link
            key={st.label}
            href={st.href}
            className="glass group animate-fade-up hover:shadow-glow relative overflow-hidden rounded-3xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 sm:p-5"
          >
            <div className="flex items-start justify-between">
              <IconTile tone={st.tone}>{st.icon}</IconTile>
              <ArrowLeft className="size-4 text-slate-600 transition group-hover:-translate-x-0.5 group-hover:text-slate-300" />
            </div>
            <div className="mt-4 text-[13px] text-slate-400">{st.label}</div>
            <div className="ltr text-end text-3xl font-bold text-white tabular-nums">
              {st.value}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">{st.hint}</div>
          </Link>
        ))}
      </section>

      {/* Quick access */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
          <Plus className="text-brand-300 size-5" /> גישה מהירה
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {quick.map((q) => (
            <Link
              key={q.label}
              href={q.href}
              className="group hover:shadow-glow relative overflow-hidden rounded-4xl border border-white/[0.07] bg-gradient-to-br from-white/[0.06] to-white/[0.01] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 sm:p-6"
            >
              <div className="group-hover:bg-brand-500/15 pointer-events-none absolute -top-10 -left-10 size-32 rounded-full bg-white/[0.04] blur-2xl transition" />
              <IconTile
                tone={q.tone}
                size="lg"
                className="transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
              >
                {q.icon}
              </IconTile>
              <div className="mt-5 text-base font-semibold text-white sm:text-lg">{q.label}</div>
              <div className="mt-1 text-xs text-slate-400 sm:text-sm">{q.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          title="עודכנו לאחרונה"
          className="xl:col-span-2"
          action={
            <Badge tone="neutral">
              <Clock /> 6 אחרונים
            </Badge>
          }
        >
          <div className="grid gap-1 md:grid-cols-2">
            {recentlyUpdated.map((i) => (
              <ItemRow key={i.id} item={i} when={i.updatedAt} />
            ))}
          </div>
        </Panel>

        <Panel title="מצב אבטחה">
          <div className="flex items-center gap-5">
            <div className="relative">
              <ScoreRing score={score} />
              <div className="absolute inset-0 grid place-items-center">
                <span className="text-2xl font-bold text-white tabular-nums">{score}</span>
              </div>
            </div>
            <ul className="flex-1 space-y-2 text-sm">
              <li className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="size-4 text-emerald-400" /> הצפנת AES-256-GCM
              </li>
              <li className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="size-4 text-emerald-400" /> אימות דו־שלבי פעיל
              </li>
              <li className="flex items-center gap-2 text-slate-300">
                <Timer className="size-4 text-emerald-400" /> נעילה אחרי {idleMinutes} דק׳
              </li>
              <li
                className={cn(
                  "flex items-center gap-2",
                  weak ? "text-amber-300" : "text-slate-300",
                )}
              >
                {weak ? (
                  <ShieldAlert className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-400" />
                )}
                {weak ? `${weak} סיסמאות חלשות` : "אין סיסמאות חלשות"}
              </li>
            </ul>
          </div>
        </Panel>

        <Panel title="נוצרו לאחרונה">
          <div className="space-y-1">
            {recentlyCreated.map((i) => (
              <ItemRow key={i.id} item={i} when={i.createdAt} />
            ))}
          </div>
        </Panel>

        <Panel
          title="מועדפים"
          action={
            <Link href="/favorites" className="text-brand-300 text-xs hover:underline">
              הכל
            </Link>
          }
        >
          <div className="space-y-1">
            {favorites.slice(0, 5).map((i) => (
              <ItemRow key={i.id} item={i} when={i.updatedAt} />
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="גיבוי"
            action={
              <Link href="/settings?tab=backup" className="text-brand-300 text-xs hover:underline">
                ניהול
              </Link>
            }
          >
            {lastBackupFailed ? (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                <XCircle className="size-4" /> הגיבוי האחרון נכשל
              </div>
            ) : null}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">גיבוי מוצלח אחרון</dt>
                <dd className="mt-0.5 text-slate-200">
                  {lastBackup ? relativeTime(lastBackup.finishedAt ?? lastBackup.startedAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">גודל</dt>
                <dd className="ltr mt-0.5 text-end text-slate-200">
                  {lastBackup ? formatBytes(lastBackup.dbBytes + lastBackup.filesBytes) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">מדיניות</dt>
                <dd className="mt-0.5 text-slate-200">7 / 4 / 6</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">הצפנה</dt>
                <dd className="mt-0.5 text-emerald-300">מופעלת</dd>
              </div>
            </dl>
          </Panel>
          <Panel
            title="פעילות התחברות"
            action={
              <Link href="/activity" className="text-brand-300 text-xs hover:underline">
                יומן
              </Link>
            }
          >
            <ul className="space-y-2.5">
              {logins.map((l) => (
                <li key={l.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-xl",
                      l.type === "LOGIN_SUCCESS"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-rose-500/10 text-rose-300",
                    )}
                  >
                    <LogIn className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-200">
                      {l.type === "LOGIN_SUCCESS" ? "כניסה מוצלחת" : "ניסיון כניסה כושל"}
                    </div>
                    <div className="ltr truncate text-end text-xs text-slate-500">
                      {l.ip} · {l.userAgent}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{relativeTime(l.at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
