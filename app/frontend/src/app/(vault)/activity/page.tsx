"use client";
import { useState } from "react";
import {
  Activity,
  Copy,
  CreditCard,
  DatabaseBackup,
  Eye,
  FilePlus2,
  FileUp,
  FileX2,
  LogIn,
  LogOut,
  PencilLine,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Image as ImageIcon,
  Download,
  type LucideIcon,
} from "lucide-react";
import { useVault } from "@/lib/vault-store";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AuditEventType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/vault/bits";

const EVENT: Record<
  AuditEventType,
  { label: string; icon: LucideIcon; tone: string; group: "auth" | "secret" | "data" | "system" }
> = {
  LOGIN_SUCCESS: {
    label: "כניסה מוצלחת",
    icon: LogIn,
    tone: "text-emerald-300 bg-emerald-500/10",
    group: "auth",
  },
  LOGIN_FAILED: {
    label: "ניסיון כניסה כושל",
    icon: ShieldAlert,
    tone: "text-rose-300 bg-rose-500/10",
    group: "auth",
  },
  LOGOUT: {
    label: "יציאה / נעילה",
    icon: LogOut,
    tone: "text-slate-300 bg-white/[0.06]",
    group: "auth",
  },
  "2FA_CHANGED": {
    label: "שינוי אימות דו־שלבי",
    icon: ShieldCheck,
    tone: "text-amber-300 bg-amber-500/10",
    group: "auth",
  },
  PASSWORD_VIEWED: {
    label: "צפייה בסוד",
    icon: Eye,
    tone: "text-violet-300 bg-violet-500/10",
    group: "secret",
  },
  PASSWORD_COPIED: {
    label: "העתקת סוד",
    icon: Copy,
    tone: "text-violet-300 bg-violet-500/10",
    group: "secret",
  },
  CARD_REVEALED: {
    label: "חשיפת כרטיס",
    icon: CreditCard,
    tone: "text-rose-300 bg-rose-500/10",
    group: "secret",
  },
  FILE_VIEWED: {
    label: "צפייה בקובץ",
    icon: ImageIcon,
    tone: "text-blue-300 bg-blue-500/10",
    group: "secret",
  },
  RECORD_CREATED: {
    label: "רשומה נוצרה",
    icon: FilePlus2,
    tone: "text-cyan-300 bg-cyan-500/10",
    group: "data",
  },
  RECORD_UPDATED: {
    label: "רשומה עודכנה",
    icon: PencilLine,
    tone: "text-cyan-300 bg-cyan-500/10",
    group: "data",
  },
  RECORD_DELETED: {
    label: "רשומה נמחקה",
    icon: FileX2,
    tone: "text-rose-300 bg-rose-500/10",
    group: "data",
  },
  RECORD_RESTORED: {
    label: "רשומה שוחזרה",
    icon: PencilLine,
    tone: "text-emerald-300 bg-emerald-500/10",
    group: "data",
  },
  RECORD_PURGED: {
    label: "רשומה נמחקה לצמיתות",
    icon: FileX2,
    tone: "text-rose-300 bg-rose-500/10",
    group: "data",
  },
  SESSION_REVOKED: {
    label: "סשן נותק",
    icon: ShieldAlert,
    tone: "text-amber-300 bg-amber-500/10",
    group: "auth",
  },
  FILE_UPLOADED: {
    label: "קובץ הועלה",
    icon: FileUp,
    tone: "text-blue-300 bg-blue-500/10",
    group: "data",
  },
  BACKUP_STARTED: {
    label: "גיבוי התחיל",
    icon: DatabaseBackup,
    tone: "text-slate-300 bg-white/[0.06]",
    group: "system",
  },
  BACKUP_SUCCESS: {
    label: "גיבוי הושלם",
    icon: DatabaseBackup,
    tone: "text-emerald-300 bg-emerald-500/10",
    group: "system",
  },
  BACKUP_FAILED: {
    label: "גיבוי נכשל",
    icon: XCircle,
    tone: "text-rose-300 bg-rose-500/10",
    group: "system",
  },
};

type Group = "all" | "auth" | "secret" | "data" | "system";

export default function ActivityPage() {
  const audit = useVault((s) => s.audit);
  const [group, setGroup] = useState<Group>("all");
  const [type, setType] = useState("");
  const list = audit.filter(
    (e) => (group === "all" || EVENT[e.type].group === group) && (!type || e.type === type),
  );
  const count = (g: Group) => audit.filter((e) => g === "all" || EVENT[e.type].group === g).length;

  return (
    <>
      <PageHeader
        title="יומן פעילות"
        subtitle="כל גישה לסודות, שינוי ונסיון כניסה נרשמים. היומן לעולם אינו מכיל ערכים מפוענחים."
        tone="emerald"
        icon={<Activity />}
        actions={
          <Button variant="secondary">
            <Download /> ייצוא CSV
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <Tabs
          value={group}
          onChange={setGroup}
          items={[
            { value: "all", label: "הכל", count: count("all") },
            { value: "auth", label: "התחברות", count: count("auth") },
            { value: "secret", label: "גישה לסודות", count: count("secret") },
            { value: "data", label: "שינויים", count: count("data") },
            { value: "system", label: "מערכת", count: count("system") },
          ]}
        />
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="glass md:ms-auto md:w-56"
          aria-label="סוג אירוע"
        >
          <option value="">כל סוגי האירועים</option>
          {Object.entries(EVENT).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <ol className="divide-y divide-white/[0.04]">
          {list.map((e) => {
            const meta = EVENT[e.type];
            return (
              <li
                key={e.id}
                className="flex flex-col gap-2 px-4 py-3.5 transition hover:bg-white/[0.02] sm:flex-row sm:items-center sm:gap-4 sm:px-5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={cn("grid size-9 shrink-0 place-items-center rounded-xl", meta.tone)}
                  >
                    <meta.icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-slate-100">{meta.label}</span>
                      <code className="ltr rounded bg-white/[0.05] px-1.5 text-[10px] text-slate-500">
                        {e.type}
                      </code>
                    </div>
                    {e.recordRef ? (
                      <div className="truncate text-xs text-slate-400">{e.recordRef}</div>
                    ) : null}
                  </div>
                </div>
                <div className="ltr flex items-center gap-3 ps-12 text-xs text-slate-500 sm:ps-0">
                  <span className="font-mono">{e.ip}</span>
                  <span className="hidden md:inline">{e.userAgent}</span>
                  <span className="hidden font-mono lg:inline">sid:{e.sessionId}</span>
                </div>
                <time
                  dateTime={e.at}
                  title={formatDateTime(e.at)}
                  className="ps-12 text-xs text-slate-500 sm:w-28 sm:ps-0 sm:text-end"
                >
                  {relativeTime(e.at)}
                </time>
              </li>
            );
          })}
          {list.length === 0 ? (
            <li className="py-14 text-center text-sm text-slate-500">אין אירועים</li>
          ) : null}
        </ol>
      </div>
    </>
  );
}
