"use client";
import { cn } from "@/lib/cn";

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; icon?: React.ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1",
        className,
      )}
    >
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all [&_svg]:size-4",
            value === it.value
              ? "bg-white/[0.09] text-white shadow-sm"
              : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
          )}
        >
          {it.icon}
          {it.label}
          {it.count !== undefined ? (
            <span className="rounded-md bg-white/[0.08] px-1.5 text-[11px] text-slate-400">
              {it.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
