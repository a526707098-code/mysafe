"use client";
import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw, Wand2 } from "lucide-react";
import {
  DEFAULT_GENERATOR,
  estimateEntropy,
  generatePassword,
  strengthLabel,
  type GeneratorOptions,
} from "@/lib/password-generator";
import { copySecret } from "@/lib/clipboard";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { IconTile } from "./icon-tile";

const BAR = ["bg-rose-500", "bg-amber-400", "bg-emerald-400", "bg-brand-400"];

export function StrengthMeter({ password }: { password: string }) {
  const bits = estimateEntropy(password);
  const { label, level } = strengthLabel(bits);
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              password && i <= level ? BAR[level] : "bg-white/10",
            )}
          />
        ))}
      </div>
      <span className="text-xs text-slate-400">
        {password ? (
          <>
            {label} · <span className="ltr">{bits} bit</span>
          </>
        ) : (
          "—"
        )}
      </span>
    </div>
  );
}

export function PasswordGenerator({ onUse }: { onUse?: (v: string) => void }) {
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);

  // Generate on the client only: crypto output must not be rendered on the server.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- regenerate when options change
    setValue(generatePassword(opts));
  }, [opts]);

  const toggles: { key: keyof GeneratorOptions; label: string; sample: string }[] = [
    { key: "upper", label: "אותיות גדולות", sample: "A–Z" },
    { key: "lower", label: "אותיות קטנות", sample: "a–z" },
    { key: "numbers", label: "ספרות", sample: "0–9" },
    { key: "symbols", label: "סימנים", sample: "!@#" },
    { key: "avoidAmbiguous", label: "ללא תווים דומים", sample: "O0 l1" },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-ink-900/80 relative overflow-hidden rounded-2xl border border-white/10 p-4">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
        <div className="ltr text-brand-100 relative min-h-12 font-mono text-lg leading-relaxed break-all">
          {value || "—"}
        </div>
        <div className="relative mt-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setValue(generatePassword(opts))}>
            <RefreshCw /> חדש
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await copySecret(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="text-emerald-400" /> : <Copy />} העתקה
          </Button>
          {onUse ? (
            <Button size="sm" variant="primary" className="ms-auto" onClick={() => onUse(value)}>
              שימוש בסיסמה
            </Button>
          ) : null}
        </div>
      </div>
      <StrengthMeter password={value} />
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <label htmlFor="gen-length" className="text-slate-300">
            אורך
          </label>
          <span className="ltr rounded-lg bg-white/[0.06] px-2 py-0.5 font-mono text-sm text-white">
            {opts.length}
          </span>
        </div>
        <input
          id="gen-length"
          type="range"
          min={8}
          max={64}
          value={opts.length}
          onChange={(e) => setOpts({ ...opts, length: Number(e.target.value) })}
          className="w-full cursor-pointer accent-cyan-400"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {toggles.map((t) => (
          <div
            key={t.key}
            className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
          >
            <div className="text-sm text-slate-200">
              {t.label}{" "}
              <span className="ltr ms-1 font-mono text-xs text-slate-500">{t.sample}</span>
            </div>
            <Switch
              label={t.label}
              checked={Boolean(opts[t.key])}
              onChange={(v) => setOpts({ ...opts, [t.key]: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GeneratorDialog({
  open,
  onOpenChange,
  onUse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUse?: (v: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="מחולל סיסמאות"
      description="סיסמאות נוצרות בדפדפן עם crypto.getRandomValues ולא נשלחות לשום מקום."
      icon={
        <IconTile tone="violet" size="sm">
          <Wand2 />
        </IconTile>
      }
    >
      <PasswordGenerator
        onUse={
          onUse
            ? (v) => {
                onUse(v);
                onOpenChange(false);
              }
            : undefined
        }
      />
    </Dialog>
  );
}
