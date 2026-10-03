"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { api, ApiError, type SecretKind } from "@/lib/api";
import { copySecret, CLIPBOARD_CLEAR_MS } from "@/lib/clipboard";
import { usePrefs } from "@/lib/prefs";
import { MASK } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Hook owning one revealed secret. The plaintext lives only in this
 * component's state, is dropped after the auto-hide delay, on unmount, and
 * when the tab is hidden.
 */
export function useSecret(kind: SecretKind, id: string, label: string) {
  const prefs = usePrefs();
  const toast = useToast();
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setValue(null);
    setExpiresAt(0);
  }, []);

  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && hide();
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [hide]);

  const reveal = async () => {
    if (value !== null) return hide();
    setLoading(true);
    try {
      const v = await api.revealSecret(kind, id, label);
      setValue(v);
      if (prefs.autoHideSecrets) {
        const ms = prefs.revealSeconds * 1000;
        setExpiresAt(Date.now() + ms);
        hideTimer.current = setTimeout(hide, ms);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.userMessage : "שגיאה בפענוח", "error");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (transform?: (v: string) => string) => {
    try {
      const v = await api.copySecret(kind, id, label);
      await copySecret(transform ? transform(v) : v);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast(
        prefs.clearClipboard
          ? `הועתק · הלוח יתנקה בעוד ${CLIPBOARD_CLEAR_MS / 1000} שניות`
          : "הועתק ללוח",
      );
    } catch (e) {
      toast(e instanceof ApiError ? e.userMessage : "ההעתקה נחסמה על ידי הדפדפן", "error");
    }
  };

  return {
    value,
    loading,
    copied,
    expiresAt,
    reveal,
    hide,
    copy,
    revealMs: prefs.revealSeconds * 1000,
  };
}

/** Thin progress bar showing how long the secret stays visible. */
export function RevealTimer({ expiresAt, total }: { expiresAt: number; total: number }) {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(
      () => setPct(Math.max(0, ((expiresAt - Date.now()) / total) * 100)),
      100,
    );
    return () => clearInterval(id);
  }, [expiresAt, total]);
  if (!expiresAt) return null;
  return (
    <span
      className="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-white/5"
      aria-hidden
    >
      <progress value={pct} max={100} className="pv-progress block h-full w-full" />
    </span>
  );
}

export function SecretField({
  kind,
  id,
  label,
  className,
  compact,
  multiline,
}: {
  kind: SecretKind;
  id: string;
  label: string;
  className?: string;
  compact?: boolean;
  multiline?: boolean;
}) {
  const s = useSecret(kind, id, label);
  return (
    <div
      className={cn(
        "bg-ink-900/60 relative flex min-w-0 items-center gap-1 rounded-xl border border-white/[0.07] ps-3 pe-1",
        compact ? "h-9" : "h-11",
        multiline && s.value?.includes("\n") && "h-auto py-2",
        className,
      )}
    >
      <span
        className={cn(
          "ltr min-w-0 flex-1 truncate text-start font-mono text-[13px]",
          s.value === null ? "tracking-[0.15em] text-slate-500" : "text-brand-200 select-all",
          multiline && "whitespace-pre-wrap",
        )}
        aria-live="polite"
      >
        {s.value ?? MASK}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={s.reveal}
        loading={s.loading}
        aria-label={s.value === null ? `הצגת ${label}` : `הסתרת ${label}`}
        title={s.value === null ? "הצגה" : "הסתרה"}
      >
        {s.loading ? null : s.value === null ? <Eye /> : <EyeOff />}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => s.copy()}
        aria-label={`העתקת ${label}`}
        title="העתקה"
      >
        {s.copied ? <Check className="text-emerald-400" /> : <Copy />}
      </Button>
      <RevealTimer expiresAt={s.expiresAt} total={s.revealMs} />
    </div>
  );
}
