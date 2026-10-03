"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { useVault } from "@/lib/vault-store";
import { NAV } from "./nav";
import { Logo } from "./logo";

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const { lock } = useSession();
  const counts = useVault((s) => ({
    "/passwords": s.passwords.length,
    "/network": s.network.length,
    "/records": s.records.length,
    "/cards": s.cards.length,
    "/documents": s.documents.length,
  }));

  return (
    <aside className="glass fixed inset-y-3 right-3 z-30 hidden w-72 flex-col rounded-4xl lg:flex">
      <div className="px-6 pt-6 pb-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="ניווט ראשי">
        {NAV.map((item, i) => {
          const active = isActive(pathname, item.href);
          const count = counts[item.href as keyof typeof counts];
          return (
            <div key={item.href}>
              {i === 6 ? <div className="mx-3 my-3 h-px bg-white/[0.06]" /> : null}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14.5px] transition-all",
                  active
                    ? "bg-gradient-to-l from-white/[0.1] to-white/[0.02] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
                )}
              >
                {active ? (
                  <span className="from-brand-400 to-accent-500 absolute inset-y-2 right-0 w-1 rounded-full bg-gradient-to-b" />
                ) : null}
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-xl transition-all [&_svg]:size-4.5",
                    active
                      ? "from-brand-500/25 to-accent-500/25 text-brand-300 bg-gradient-to-br ring-1 ring-white/10"
                      : "text-slate-500 group-hover:text-slate-300",
                  )}
                >
                  <item.icon />
                </span>
                <span className="flex-1 font-medium">{item.label}</span>
                {count !== undefined ? (
                  <span className="ltr text-xs text-slate-500 tabular-nums">{count}</span>
                ) : null}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3.5 py-2.5 text-xs text-emerald-300">
          <ShieldCheck className="size-4" />
          <span className="flex-1">הכספת מוצפנת · AES-256-GCM</span>
        </div>
        <button
          type="button"
          onClick={() => lock("manual")}
          className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-sm font-semibold text-slate-200 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
        >
          <Lock className="size-4 transition-transform group-hover:-rotate-12" />
          נעילת הכספת
        </button>
      </div>
    </aside>
  );
}
