"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Menu } from "lucide-react";
import * as D from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { MOBILE_PRIMARY, NAV } from "./nav";
import { isActive } from "./sidebar";
import { Logo } from "./logo";
import { IconTile } from "./icon-tile";

export function MobileNav() {
  const pathname = usePathname();
  const { lock } = useSession();
  const [open, setOpen] = useState(false);
  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.href));

  return (
    <>
      <nav
        aria-label="ניווט"
        className="glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-stretch justify-around rounded-3xl px-1.5 py-1.5 lg:hidden"
      >
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium transition",
                active ? "bg-white/[0.08] text-white" : "text-slate-400",
              )}
            >
              <item.icon className={cn("size-5", active && "text-brand-300")} />
              {item.short}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium text-slate-400"
        >
          <Menu className="size-5" />
          עוד
        </button>
      </nav>

      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="bg-ink-950/70 fixed inset-0 z-50 backdrop-blur-sm lg:hidden" />
          <D.Content
            dir="rtl"
            className="glass-strong animate-fade-up fixed inset-x-0 bottom-0 z-50 rounded-t-[2rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none lg:hidden"
          >
            <D.Title className="sr-only">תפריט</D.Title>
            <D.Description className="sr-only">כל אזורי הכספת</D.Description>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
            <Logo className="mb-5" />
            <div className="grid grid-cols-3 gap-2.5">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-2 py-3.5 text-xs font-medium text-slate-300",
                    isActive(pathname, item.href) &&
                      "border-brand-500/30 bg-brand-500/10 text-white",
                  )}
                >
                  <IconTile tone={item.tone} size="sm">
                    <item.icon />
                  </IconTile>
                  {item.short}
                </Link>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                lock("manual");
              }}
              className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 py-3.5 text-sm font-semibold text-rose-200"
            >
              <Lock className="size-4" />
              נעילת הכספת
            </button>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
