import {
  AtSign,
  Briefcase,
  Folder,
  Heart,
  Home,
  Landmark,
  Receipt,
  Server,
  ShieldCheck,
  Umbrella,
  User,
  Wifi,
  Car,
  type LucideIcon,
} from "lucide-react";

/** User-created categories store an icon key; unknown keys fall back to a folder. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  user: User,
  briefcase: Briefcase,
  landmark: Landmark,
  server: Server,
  "at-sign": AtSign,
  receipt: Receipt,
  "shield-check": ShieldCheck,
  umbrella: Umbrella,
  home: Home,
  heart: Heart,
  wifi: Wifi,
  car: Car,
  folder: Folder,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? Folder;
  return <Icon className={className} />;
}
