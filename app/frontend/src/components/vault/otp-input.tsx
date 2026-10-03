"use client";
import { useRef } from "react";
import { cn } from "@/lib/cn";

/** Six-box TOTP input with paste support and one-time-code autofill. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete?.(clean);
    refs.current[Math.min(clean.length, 5)]?.focus();
  };

  return (
    <div className="ltr flex justify-center gap-2 sm:gap-3" dir="ltr">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={i === 0 ? 6 : 1}
          autoFocus={i === 0}
          aria-label={`ספרה ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length > 1) return set(v); // autofill / paste into a box
            set(value.slice(0, i) + v + value.slice(i + 1));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) {
              e.preventDefault();
              set(value.slice(0, i - 1));
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            set(e.clipboardData.getData("text"));
          }}
          className={cn(
            "bg-ink-900/70 size-12 rounded-2xl border text-center font-mono text-2xl font-semibold text-white transition outline-none sm:size-14",
            invalid
              ? "border-rose-500/50"
              : d
                ? "border-brand-500/50 shadow-[0_0_20px_-6px_rgb(34_211_238/0.5)]"
                : "focus:border-brand-500/60 border-white/10",
          )}
        />
      ))}
    </div>
  );
}
