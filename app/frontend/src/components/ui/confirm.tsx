"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";

/**
 * Confirmation for destructive actions. `typeToConfirm` adds a typed-phrase
 * gate for the irreversible ones (permanent delete, restore backup, reset).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "אישור",
  onConfirm,
  typeToConfirm,
  tone = "danger",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  typeToConfirm?: string;
  tone?: "danger" | "primary";
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = typeToConfirm !== undefined && typed.trim() !== typeToConfirm;
  const close = (v: boolean) => {
    if (!v) setTyped("");
    onOpenChange(v);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      size="sm"
      title={title}
      icon={
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-300">
          <AlertTriangle className="size-5" />
        </span>
      }
      footer={
        <>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            disabled={blocked}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                close(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={() => close(false)}>
            ביטול
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-300">{description}</p>
      {typeToConfirm ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-400">
            להמשך יש להקליד{" "}
            <span className="font-mono font-semibold text-rose-300">{typeToConfirm}</span>
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-label="אישור בהקלדה"
          />
        </div>
      ) : null}
    </Dialog>
  );
}
