import {
  Activity,
  FileText,
  FolderOpen,
  Globe,
  House,
  KeyRound,
  Network,
  Settings,
  Star,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "./icon-tile";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  tone: Tone;
}

export const NAV: NavItem[] = [
  { href: "/", label: "לוח ראשי", short: "ראשי", icon: House, tone: "slate" },
  { href: "/passwords", label: "סיסמאות ואתרים", short: "סיסמאות", icon: KeyRound, tone: "violet" },
  { href: "/network", label: "רשת ושרתים", short: "רשת", icon: Network, tone: "cyan" },
  { href: "/records", label: "רישומים", short: "רישומים", icon: FileText, tone: "amber" },
  { href: "/cards", label: "כרטיסים", short: "כרטיסים", icon: CreditCard, tone: "rose" },
  { href: "/documents", label: "מסמכים", short: "מסמכים", icon: FolderOpen, tone: "blue" },
  { href: "/favorites", label: "מועדפים", short: "מועדפים", icon: Star, tone: "yellow" },
  { href: "/activity", label: "יומן פעילות", short: "יומן", icon: Activity, tone: "emerald" },
  { href: "/settings", label: "הגדרות", short: "הגדרות", icon: Settings, tone: "slate" },
];

/** Bottom bar on mobile: the most used destinations; the rest live in the menu sheet. */
export const MOBILE_PRIMARY = ["/", "/passwords", "/network", "/documents"];

export const SECTION_ICON = { Globe };
