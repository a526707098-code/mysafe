import { Lock, ShieldCheck, Server } from "lucide-react";
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
          <div className="relative mx-auto mb-12 grid size-56 place-items-center">
            <div className="absolute inset-0 rounded-[3rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-xl" />
            <div className="border-brand-400/20 from-brand-500/10 to-accent-500/10 absolute inset-6 rounded-[2.4rem] border bg-gradient-to-br" />
            <div className="from-brand-400 to-accent-500 relative grid size-24 place-items-center rounded-[1.8rem] bg-gradient-to-br shadow-[0_20px_60px_-10px_rgb(34_211_238/0.5)] ring-1 ring-white/30 ring-inset">
              <Lock className="text-ink-950 size-11" strokeWidth={2.2} />
            </div>
          </div>
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
