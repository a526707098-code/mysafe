import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-white/[0.06] text-slate-300 border-white/10",
  brand: "bg-brand-500/10 text-brand-300 border-brand-500/25",
  violet: "bg-accent-500/10 text-accent-400 border-accent-500/25",
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  danger: "bg-rose-500/10 text-rose-300 border-rose-500/25",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
