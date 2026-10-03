"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";

/** Copy for NON-secret values (usernames, IPs). Secrets go through useSecret().copy. */
export function CopyText({
  value,
  className,
  mono,
}: {
  value: string;
  className?: string;
  mono?: boolean;
}) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
          toast("הועתק ללוח");
        } catch {
          toast("ההעתקה נחסמה על ידי הדפדפן", "error");
        }
      }}
      className={cn(
        "group inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-start transition hover:bg-white/[0.06]",
        className,
      )}
      title="העתקה"
    >
      <span className={cn("ltr truncate", mono && "font-mono text-[13px]")}>{value}</span>
      {done ? (
        <Check className="size-3.5 shrink-0 text-emerald-400" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-slate-600 opacity-0 transition group-hover:opacity-100" />
      )}
    </button>
  );
}
