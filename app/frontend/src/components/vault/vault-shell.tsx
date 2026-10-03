"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { useVault, vault } from "@/lib/vault-store";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { Topbar } from "./topbar";
import { Logo } from "./logo";

/** Authenticated frame: guards the route, loads data, renders navigation. */
export function VaultShell({ children }: { children: React.ReactNode }) {
  const { stage } = useSession();
  const router = useRouter();
  const loaded = useVault((s) => s.loaded);

  useEffect(() => {
    if (stage === "locked") router.replace("/login");
    else if (stage === "awaiting-totp") router.replace("/login/verify");
    else if (stage === "unlocked") vault.load();
  }, [stage, router]);

  if (stage !== "unlocked" || !loaded) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <Logo compact />
          <span className="text-sm">טוען את הכספת...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="px-4 pb-32 sm:px-6 lg:ps-80 lg:pe-8 lg:pt-6 lg:pb-12 xl:pe-10">
        <div className="mx-auto max-w-7xl">
          <Topbar />
          <main className="animate-fade-up">{children}</main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
