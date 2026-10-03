import { cn } from "@/lib/cn";

const PALETTE = [
  "from-violet-500/40 to-indigo-600/40 text-violet-100",
  "from-cyan-500/40 to-sky-600/40 text-cyan-100",
  "from-emerald-500/40 to-teal-600/40 text-emerald-100",
  "from-rose-500/40 to-pink-600/40 text-rose-100",
  "from-amber-500/40 to-orange-600/40 text-amber-100",
];

/** Letter avatar: no remote favicon fetches, which would leak the site list to third parties. */
export function SiteAvatar({ name, className }: { name: string; className?: string }) {
  const code = [...name].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold ring-1 ring-white/10",
        PALETTE[code % PALETTE.length],
        className,
      )}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
