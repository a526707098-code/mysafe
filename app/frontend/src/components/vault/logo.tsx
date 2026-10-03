import { ShieldHalf } from "lucide-react";
import { cn } from "@/lib/cn";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="from-brand-400 to-accent-500 relative grid size-10 place-items-center rounded-2xl bg-gradient-to-br via-cyan-500 shadow-lg ring-1 shadow-cyan-500/30 ring-white/25 ring-inset">
        <span className="absolute inset-x-1 top-0.5 h-1/2 rounded-[inherit] bg-gradient-to-b from-white/50 to-transparent opacity-50" />
        <ShieldHalf className="text-ink-950 relative size-5" strokeWidth={2.4} />
      </span>
      {compact ? null : (
        <div className="leading-tight">
          <div className="ltr text-[15px] font-extrabold tracking-[0.18em] text-white">
            PRIVATE VAULT
          </div>
          <div className="text-[11px] text-slate-500">הכספת הפרטית שלך</div>
        </div>
      )}
    </div>
  );
}
