"use client";
import { useEffect, useState } from "react";
import { Lock, Search, ShieldCheck, Timer } from "lucide-react";
import { useSession } from "@/lib/session";
import { Logo } from "./logo";
import { CommandSearch } from "./command-search";

function useCountdown(getTarget: () => number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, getTarget() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [getTarget]);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Topbar() {
  const { lock, getLockAt, username } = useSession();
  const [open, setOpen] = useState(false);
  const countdown = useCountdown(getLockAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="bg-ink-950/60 sticky top-0 z-20 -mx-4 mb-6 flex items-center gap-3 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:mx-0 lg:mb-8 lg:bg-transparent lg:px-0 lg:pt-1 lg:backdrop-blur-none">
        <Logo compact className="lg:hidden" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="glass group flex h-12 flex-1 cursor-pointer items-center gap-3 rounded-2xl px-4 text-sm text-slate-500 transition hover:border-white/15 lg:max-w-xl"
          aria-label="חיפוש גלובלי"
        >
          <Search className="group-hover:text-brand-400 size-4.5 text-slate-400 transition" />
          <span className="flex-1 truncate text-start">חיפוש בכל הכספת...</span>
          <kbd className="ltr hidden rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-400 sm:block">
            Ctrl K
          </kbd>
        </button>
        <div className="hidden items-center gap-2 lg:ms-auto lg:flex">
          <span className="glass flex h-10 items-center gap-2 rounded-xl px-3 text-xs text-emerald-300">
            <ShieldCheck className="size-4" /> 2FA פעיל
          </span>
          <span
            className="glass flex h-10 items-center gap-2 rounded-xl px-3 text-xs text-slate-300"
            title="נעילה אוטומטית בחוסר פעילות"
          >
            <Timer className="size-4 text-amber-300" />
            <span className="ltr tabular-nums">{countdown}</span>
          </span>
          <span className="from-accent-500/40 to-brand-500/30 grid size-10 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ring-1 ring-white/15">
            {(username || "A").slice(0, 1).toUpperCase()}
          </span>
        </div>
        <button
          type="button"
          onClick={() => lock("manual")}
          className="glass grid size-12 shrink-0 cursor-pointer place-items-center rounded-2xl text-slate-300 lg:hidden"
          aria-label="נעילת הכספת"
        >
          <Lock className="size-4.5" />
        </button>
      </header>
      <CommandSearch open={open} onOpenChange={setOpen} />
    </>
  );
}
