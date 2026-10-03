import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass relative flex flex-col items-center overflow-hidden rounded-4xl px-6 py-16 text-center",
        className,
      )}
    >
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative mb-5">{icon}</div>
      <h3 className="relative text-lg font-semibold text-white">{title}</h3>
      {description ? (
        <p className="relative mt-2 max-w-sm text-sm text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="relative mt-6">{action}</div> : null}
    </div>
  );
}
