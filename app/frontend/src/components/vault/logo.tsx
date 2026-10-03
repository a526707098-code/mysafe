import { cn } from "@/lib/cn";

/** Emblem + wordmark. The emblem is the MySafe logo artwork (public/brand). */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset, no optimisation needed */}
      <img
        src="/brand/mysafe-mark.png"
        alt={compact ? "MySafe" : ""}
        width={44}
        height={44}
        className="size-11 shrink-0 drop-shadow-[0_6px_16px_rgb(34_211_238/0.35)]"
      />
      {compact ? null : (
        <div className="leading-tight">
          <div className="ltr text-xl font-extrabold tracking-wide text-white">
            My
            <span className="from-brand-300 to-accent-400 bg-gradient-to-l bg-clip-text text-transparent">
              Safe
            </span>
          </div>
          <div className="text-[11px] text-slate-500">הכספת הפרטית שלך</div>
        </div>
      )}
    </div>
  );
}
