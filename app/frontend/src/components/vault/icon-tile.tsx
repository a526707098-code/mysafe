import { cn } from "@/lib/cn";

/** Gradient "3D-like" tiles. Literal class strings so Tailwind can see them. */
export const TONES = {
  violet: "from-violet-400 via-violet-500 to-indigo-700 shadow-violet-500/30",
  cyan: "from-cyan-300 via-cyan-500 to-sky-700 shadow-cyan-500/30",
  amber: "from-amber-300 via-amber-500 to-orange-700 shadow-amber-500/30",
  rose: "from-rose-300 via-rose-500 to-pink-700 shadow-rose-500/30",
  blue: "from-sky-300 via-blue-500 to-indigo-700 shadow-blue-500/30",
  yellow: "from-yellow-200 via-yellow-400 to-amber-600 shadow-yellow-500/30",
  emerald: "from-emerald-300 via-emerald-500 to-teal-700 shadow-emerald-500/30",
  slate: "from-slate-300 via-slate-500 to-slate-700 shadow-slate-500/20",
  pink: "from-pink-300 via-pink-500 to-fuchsia-700 shadow-pink-500/30",
  sky: "from-sky-200 via-sky-400 to-sky-700 shadow-sky-500/30",
  teal: "from-teal-200 via-teal-400 to-teal-700 shadow-teal-500/30",
  indigo: "from-indigo-300 via-indigo-500 to-indigo-800 shadow-indigo-500/30",
} as const;
export type Tone = keyof typeof TONES;
export const isTone = (v: string): v is Tone => v in TONES;

const SIZES = {
  sm: "size-9 rounded-xl [&_svg]:size-4.5",
  md: "size-11 rounded-2xl [&_svg]:size-5",
  lg: "size-14 rounded-[1.1rem] [&_svg]:size-6.5",
  xl: "size-20 rounded-[1.6rem] [&_svg]:size-9",
};

export function IconTile({
  tone,
  size = "md",
  children,
  className,
}: {
  tone: Tone;
  size?: keyof typeof SIZES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center bg-gradient-to-br text-white shadow-lg ring-1 ring-white/20 ring-inset",
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {/* top highlight + inner shade give the tile depth */}
      <span className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-[inherit] bg-gradient-to-b from-white/45 to-transparent opacity-60" />
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_-6px_12px_rgb(0_0_0/0.25)]" />
      <span className="relative drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]">{children}</span>
    </span>
  );
}
