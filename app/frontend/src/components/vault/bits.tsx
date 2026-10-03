"use client";
import { Pencil, Search, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useVault, vault } from "@/lib/vault-store";
import type { VaultItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { CategoryIcon } from "./category-icon";
import { IconTile, isTone, type Tone } from "./icon-tile";

export function PageHeader({
  title,
  subtitle,
  icon,
  tone,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  tone: Tone;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <IconTile tone={tone} size="lg">
          {icon}
        </IconTile>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[28px]">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function FavoriteButton({
  item,
  size = "icon-sm",
}: {
  item: VaultItem;
  size?: "icon-sm" | "icon";
}) {
  return (
    <Button
      size={size}
      variant="ghost"
      onClick={() => vault.toggleFavorite(item)}
      aria-pressed={item.favorite}
      aria-label={item.favorite ? "הסרה ממועדפים" : "הוספה למועדפים"}
      title="מועדף"
    >
      <Star className={cn(item.favorite ? "fill-yellow-400 text-yellow-400" : "")} />
    </Button>
  );
}

export function RowActions({
  item,
  onEdit,
  onDelete,
  children,
}: {
  item: VaultItem;
  onEdit: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {children}
      <FavoriteButton item={item} />
      <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="עריכה" title="עריכה">
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onDelete}
        aria-label="מחיקה"
        title="מחיקה"
        className="hover:bg-rose-500/10 hover:text-rose-300"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export function TagChips({ tags, className }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((t) => (
        <span
          key={t}
          className="ltr rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-400"
        >
          #{t}
        </span>
      ))}
    </div>
  );
}

const PILL: Record<Tone, string> = {
  violet: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  cyan: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
  amber: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  rose: "text-rose-300 bg-rose-500/10 border-rose-500/20",
  blue: "text-blue-300 bg-blue-500/10 border-blue-500/20",
  yellow: "text-yellow-300 bg-yellow-500/10 border-yellow-500/20",
  emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  slate: "text-slate-300 bg-slate-500/10 border-slate-500/20",
  pink: "text-pink-300 bg-pink-500/10 border-pink-500/20",
  sky: "text-sky-300 bg-sky-500/10 border-sky-500/20",
  teal: "text-teal-300 bg-teal-500/10 border-teal-500/20",
  indigo: "text-indigo-300 bg-indigo-500/10 border-indigo-500/20",
};

export function CategoryPill({ id }: { id?: string }) {
  const cat = useVault((s) => s.categories.find((c) => c.id === id));
  if (!cat) return <span className="text-xs text-slate-600">—</span>;
  const tone: Tone = isTone(cat.color) ? cat.color : "slate";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs whitespace-nowrap",
        PILL[tone],
      )}
    >
      <CategoryIcon name={cat.icon} className="size-3.5" />
      {cat.name}
    </span>
  );
}

export interface ToolbarState {
  q: string;
  category: string;
  tag: string;
  favorites: boolean;
}

export function SectionToolbar({
  state,
  onChange,
  placeholder,
  extra,
}: {
  state: ToolbarState;
  onChange: (s: ToolbarState) => void;
  placeholder: string;
  extra?: React.ReactNode;
}) {
  const categories = useVault((s) => s.categories);
  const tags = useVault((s) => s.tags);
  return (
    <div className="mb-5 flex flex-col gap-2.5 md:flex-row md:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-slate-500" />
        <input
          value={state.q}
          onChange={(e) => onChange({ ...state, q: e.target.value })}
          placeholder={placeholder}
          className="glass focus:border-brand-500/40 h-11 w-full rounded-xl ps-10 pe-9 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          aria-label="סינון"
        />
        {state.q ? (
          <button
            type="button"
            onClick={() => onChange({ ...state, q: "" })}
            className="absolute top-1/2 left-3 -translate-y-1/2 cursor-pointer text-slate-500 hover:text-white"
            aria-label="ניקוי"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:flex">
        <Select
          value={state.category}
          onChange={(e) => onChange({ ...state, category: e.target.value })}
          className="glass md:w-40"
          aria-label="קטגוריה"
        >
          <option value="">כל הקטגוריות</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={state.tag}
          onChange={(e) => onChange({ ...state, tag: e.target.value })}
          className="glass md:w-36"
          aria-label="תגית"
        >
          <option value="">כל התגיות</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
        <Button
          variant={state.favorites ? "primary" : "secondary"}
          onClick={() => onChange({ ...state, favorites: !state.favorites })}
          className="col-span-2 h-11 md:col-span-1"
          aria-pressed={state.favorites}
        >
          <Star className={state.favorites ? "fill-current" : ""} /> מועדפים
        </Button>
        {extra}
      </div>
    </div>
  );
}

export function applyToolbar<T extends VaultItem>(
  items: T[],
  s: ToolbarState,
  text: (i: T) => (string | undefined)[],
) {
  const q = s.q.trim().toLowerCase();
  return items.filter(
    (i) =>
      (!s.category || i.categoryId === s.category) &&
      (!s.tag || i.tags.includes(s.tag)) &&
      (!s.favorites || i.favorite) &&
      (!q || [i.title, ...i.tags, ...text(i)].some((v) => v?.toLowerCase().includes(q))),
  );
}

export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const known = useVault((s) => s.tags);
  return (
    <div className="flex flex-wrap gap-1.5">
      {known.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}
            className={cn(
              "ltr cursor-pointer rounded-lg border px-2.5 py-1 text-xs transition",
              on
                ? "border-brand-500/40 bg-brand-500/15 text-brand-200"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200",
            )}
            aria-pressed={on}
          >
            #{t}
          </button>
        );
      })}
    </div>
  );
}

export function CategorySelect({
  value,
  onChange,
  id,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
  id?: string;
}) {
  const categories = useVault((s) => s.categories);
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">ללא קטגוריה</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
