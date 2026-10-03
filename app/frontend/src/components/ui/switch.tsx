"use client";
import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-brand-500/50 bg-brand-500/30" : "border-white/10 bg-white/[0.06]",
      )}
    >
      <span
        className={cn(
          "inline-block size-4.5 rounded-full shadow transition-transform",
          checked ? "bg-brand-300 -translate-x-5.5" : "-translate-x-0.5 bg-slate-400",
        )}
      />
    </button>
  );
}
