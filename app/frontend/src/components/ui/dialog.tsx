"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  icon,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: React.ReactNode;
}) {
  const width = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[
    size
  ];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="bg-ink-950/70 fixed inset-0 z-50 backdrop-blur-sm data-[state=open]:animate-[fade-up_0.2s_ease-out]" />
        <D.Content
          dir="rtl"
          className={cn(
            "glass-strong data-[state=open]:animate-scale-in fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl",
            width,
          )}
        >
          <div className="flex items-start gap-3 border-b border-white/[0.06] p-5 sm:p-6">
            {icon}
            <div className="min-w-0 flex-1">
              <D.Title className="text-lg font-semibold text-white">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-slate-400">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close
              className="-m-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="סגירה"
            >
              <X className="size-5" />
            </D.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-start sm:px-6">
              {footer}
            </div>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
