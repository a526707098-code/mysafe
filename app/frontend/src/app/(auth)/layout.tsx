import { ShieldCheck, Server } from "lucide-react";
import { Logo } from "@/components/vault/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="grid-bg pointer-events-none fixed inset-0" />
      <section className="relative flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="animate-fade-up w-full max-w-md">{children}</div>
      </section>
      <aside className="relative hidden overflow-hidden border-s border-white/[0.06] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-accent-500/20 pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full blur-[120px]" />
        <div className="bg-brand-500/15 pointer-events-none absolute right-0 -bottom-40 size-[30rem] rounded-full blur-[120px]" />
        <Logo className="relative" />
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img
            src="/brand/mysafe-logo.png"
            alt="MySafe"
            width={320}
            height={320}
            className="mx-auto mb-10 size-72 drop-shadow-[0_20px_60px_rgb(34_211_238/0.25)]"
          />
          <h2 className="text-gradient text-4xl leading-tight font-extrabold">
            כל מה שפרטי.
            <br />
            במקום אחד מוצפן.
          </h2>
          <p className="mt-4 max-w-md text-slate-400">
            סיסמאות, ציוד רשת, כרטיסים ומסמכים — מוצפנים ב־AES-256-GCM, מוגנים באימות דו־שלבי, ורצים
            על השרת שלך בלבד.
          </p>
        </div>
        <div className="relative flex gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-400" /> Argon2id + TOTP
          </span>
          <span className="flex items-center gap-2">
            <Server className="text-brand-400 size-4" /> אחסון עצמי בלבד
          </span>
        </div>
      </aside>
    </div>
  );
}
