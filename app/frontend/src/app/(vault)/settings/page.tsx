"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveRestore,
  CheckCircle2,
  Cloud,
  DatabaseBackup,
  Download,
  FileArchive,
  FolderTree,
  HardDrive,
  KeyRound,
  Laptop,
  LogOut,
  MonitorSmartphone,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  Timer,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useVault, vault } from "@/lib/vault-store";
import { useSession } from "@/lib/session";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Category } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { IconTile, isTone, TONES, type Tone } from "@/components/vault/icon-tile";
import { CATEGORY_ICONS, CategoryIcon } from "@/components/vault/category-icon";
import { PageHeader } from "@/components/vault/bits";
import { StrengthMeter } from "@/components/vault/password-generator";

type Tab = "security" | "sessions" | "backup" | "categories" | "trash" | "export";

function Card({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("glass rounded-4xl p-5 sm:p-6", className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3.5 last:border-0">
      <div>
        <div className="text-sm text-slate-200">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SecurityTab() {
  const toast = useToast();
  const prefs = usePrefs();
  const { idleMinutes, setIdleMinutes } = useSession();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [confirm, setConfirm] = useState<"" | "reset2fa" | "codes" | "disable2fa">("");

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card
        title="אימות דו־שלבי (TOTP)"
        description="חובה בכל כניסה. תואם Google Authenticator, Microsoft Authenticator, 2FAS ו־Authy."
      >
        <div className="mb-4 flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
          <IconTile tone="emerald">
            <Smartphone />
          </IconTile>
          <div className="flex-1">
            <div className="font-medium text-emerald-200">פעיל</div>
            <div className="text-xs text-slate-400">
              הוגדר לפני 20 יום · 8 מתוך 10 קודי שחזור זמינים
            </div>
          </div>
          <ShieldCheck className="size-6 text-emerald-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConfirm("reset2fa")}>
            <RotateCcw /> חיבור אפליקציה חדשה
          </Button>
          <Button variant="secondary" onClick={() => setConfirm("codes")}>
            <KeyRound /> קודי שחזור חדשים
          </Button>
          <Button variant="danger" onClick={() => setConfirm("disable2fa")}>
            ביטול 2FA
          </Button>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          “זכור מכשיר זה” אינו זמין במכוון — כל כניסה דורשת קוד.
        </p>
      </Card>

      <Card
        title="סיסמה ראשית"
        description="נשמרת כ־Argon2id hash. שינוי הסיסמה מנתק את כל הסשנים האחרים."
      >
        <div className="space-y-3">
          <Field label="סיסמה נוכחית" htmlFor="cur">
            <Input
              id="cur"
              type="password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              autoComplete="current-password"
              className="ltr text-right"
            />
          </Field>
          <Field label="סיסמה חדשה" htmlFor="new">
            <Input
              id="new"
              type="password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              autoComplete="new-password"
              className="ltr text-right"
            />
          </Field>
          {pw.next ? <StrengthMeter password={pw.next} /> : null}
          <Field
            label="אימות סיסמה חדשה"
            htmlFor="cnf"
            error={pw.confirm && pw.confirm !== pw.next ? "אינו תואם" : undefined}
          >
            <Input
              id="cnf"
              type="password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              autoComplete="new-password"
              className="ltr text-right"
            />
          </Field>
          <Button
            variant="primary"
            disabled={!pw.current || pw.next.length < 14 || pw.next !== pw.confirm}
            onClick={() => {
              setPw({ current: "", next: "", confirm: "" });
              toast("הסיסמה עודכנה · סשנים אחרים נותקו");
            }}
          >
            עדכון סיסמה
          </Button>
        </div>
      </Card>

      <Card title="נעילה וסשנים" description="ברירות מחדל מאובטחות; ניתן לשנות.">
        <Row label="נעילה אוטומטית בחוסר פעילות" hint="ברירת מחדל: 15 דקות">
          <Select
            value={idleMinutes}
            onChange={(e) => setIdleMinutes(Number(e.target.value))}
            className="h-9 w-32"
          >
            {[5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} דקות
              </option>
            ))}
          </Select>
        </Row>
        <Row label="תפוגה מוחלטת של סשן" hint="גם עם פעילות רציפה">
          <Badge tone="neutral">
            <Timer /> 12 שעות
          </Badge>
        </Row>
        <Row label="הסתרה אוטומטית של סודות" hint={`הסוד מוסתר אחרי ${prefs.revealSeconds} שניות`}>
          <Switch
            label="הסתרה אוטומטית"
            checked={prefs.autoHideSecrets}
            onChange={(v) => setPrefs({ autoHideSecrets: v })}
          />
        </Row>
        <Row label="ניקוי לוח ההעתקה" hint="30 שניות אחרי העתקת סוד, כשהדפדפן מאפשר">
          <Switch
            label="ניקוי לוח"
            checked={prefs.clearClipboard}
            onChange={(v) => setPrefs({ clearClipboard: v })}
          />
        </Row>
      </Card>

      <Card title="הגנה מפני ניחוש" description="נאכף בשרת, לפי IP ולפי שם משתמש.">
        <ul className="space-y-2.5 text-sm text-slate-300">
          {[
            "השהיה הולכת וגדלה אחרי כל כישלון",
            "נעילה זמנית של 15 דקות אחרי 5 כישלונות",
            "כל ניסיון כושל נרשם ביומן עם IP ו־User-Agent",
            "אין נעילה קבועה: שחזור דרך קוד שחזור או סקריפט שרת",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> {t}
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={confirm === "reset2fa"}
        onOpenChange={(v) => !v && setConfirm("")}
        tone="primary"
        title="חיבור אפליקציית אימות חדשה"
        description="יוצג קוד QR חדש. האפליקציה הקודמת תפסיק לעבוד רק אחרי אימות הקוד הראשון מהחדשה."
        confirmLabel="המשך"
        onConfirm={() => {
          vault.log("2FA_CHANGED");
          toast("בגרסה המלאה יוצג כאן קוד QR חדש", "info");
        }}
      />
      <ConfirmDialog
        open={confirm === "codes"}
        onOpenChange={(v) => !v && setConfirm("")}
        tone="primary"
        title="יצירת קודי שחזור חדשים"
        description="כל קודי השחזור הקיימים יבוטלו מיד."
        confirmLabel="יצירה"
        onConfirm={() => {
          vault.log("2FA_CHANGED");
          toast("נוצרו 10 קודי שחזור חדשים");
        }}
      />
      <ConfirmDialog
        open={confirm === "disable2fa"}
        onOpenChange={(v) => !v && setConfirm("")}
        title="ביטול אימות דו־שלבי"
        description="ביטול 2FA מוריד משמעותית את רמת האבטחה של הכספת: סיסמה שדלפה תספיק לכניסה. נדרש גם קוד TOTP נוכחי."
        typeToConfirm="בטל 2FA"
        confirmLabel="ביטול 2FA"
        onConfirm={() => {
          vault.log("2FA_CHANGED");
          toast("בפרוטוטייפ 2FA נשאר פעיל", "info");
        }}
      />
    </div>
  );
}

function SessionsTab() {
  const sessions = useVault((s) => s.sessions);
  const toast = useToast();
  const [confirmAll, setConfirmAll] = useState(false);
  return (
    <Card
      title="סשנים פעילים"
      description="כל סשן מוגבל ל־15 דקות חוסר פעילות ו־12 שעות בסך הכל."
      action={
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmAll(true)}
          disabled={sessions.length < 2}
        >
          <LogOut /> ניתוק כל האחרים
        </Button>
      }
    >
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <IconTile tone={s.current ? "emerald" : "slate"} size="sm">
              {/iphone|android/i.test(s.device) ? <Smartphone /> : <Laptop />}
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                {s.device} · {s.browser}
                {s.current ? <Badge tone="success">הסשן הנוכחי</Badge> : null}
              </div>
              <div className="ltr text-end text-xs text-slate-500 sm:text-start">
                {s.ip} · started {formatDateTime(s.createdAt)}
              </div>
            </div>
            <span className="hidden text-xs text-slate-500 sm:block">
              פעיל {relativeTime(s.lastActiveAt)}
            </span>
            {!s.current ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  vault.revokeSession(s.id);
                  toast("הסשן נותק");
                }}
              >
                ניתוק
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="ניתוק כל הסשנים האחרים"
        description="כל המכשירים מלבד זה ידרשו כניסה מחדש עם סיסמה וקוד TOTP."
        confirmLabel="ניתוק"
        onConfirm={() => {
          vault.revokeOtherSessions();
          toast("כל הסשנים האחרים נותקו");
        }}
      />
    </Card>
  );
}

function BackupTab() {
  const backups = useVault((s) => s.backups);
  const toast = useToast();
  const [restore, setRestore] = useState(false);
  const last = backups.find((b) => b.status === "success");
  const running = backups.some((b) => b.status === "running");
  const failures = backups.filter((b) => b.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "גיבוי אחרון",
            value: last ? relativeTime(last.finishedAt ?? last.startedAt) : "—",
            icon: <DatabaseBackup />,
            tone: "emerald" as Tone,
          },
          {
            label: "סטטוס",
            value: backups[0]?.status === "failed" ? "נכשל" : running ? "רץ..." : "תקין",
            icon: backups[0]?.status === "failed" ? <XCircle /> : <CheckCircle2 />,
            tone: (backups[0]?.status === "failed" ? "rose" : "emerald") as Tone,
          },
          {
            label: "מסד נתונים",
            value: last ? formatBytes(last.dbBytes) : "—",
            icon: <Server />,
            tone: "cyan" as Tone,
          },
          {
            label: "קבצים מוצפנים",
            value: last ? formatBytes(last.filesBytes) : "—",
            icon: <HardDrive />,
            tone: "blue" as Tone,
          },
        ].map((s) => (
          <div key={s.label} className="glass rounded-3xl p-4">
            <IconTile tone={s.tone} size="sm">
              {s.icon}
            </IconTile>
            <div className="mt-3 text-xs text-slate-500">{s.label}</div>
            <div className="mt-0.5 text-lg font-semibold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title="היסטוריית גיבויים"
          className="xl:col-span-2"
          description={failures ? `${failures} כישלונות בהיסטוריה` : undefined}
          action={
            <Button
              variant="primary"
              size="sm"
              loading={running}
              onClick={async () => {
                toast("הגיבוי התחיל", "info");
                await vault.runBackup();
                toast("הגיבוי הושלם בהצלחה");
              }}
            >
              <Play /> הרצת גיבוי עכשיו
            </Button>
          }
        >
          <ul className="divide-y divide-white/[0.05]">
            {backups.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-xl",
                    b.status === "success"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : b.status === "failed"
                        ? "bg-rose-500/10 text-rose-300"
                        : "bg-brand-500/10 text-brand-300",
                  )}
                >
                  {b.status === "success" ? (
                    <CheckCircle2 className="size-4" />
                  ) : b.status === "failed" ? (
                    <XCircle className="size-4" />
                  ) : (
                    <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-slate-200">{formatDateTime(b.startedAt)}</div>
                  {b.error ? <div className="text-xs text-rose-300">{b.error}</div> : null}
                </div>
                <Badge tone={b.kind === "manual" ? "brand" : "neutral"}>
                  {{ daily: "יומי", weekly: "שבועי", monthly: "חודשי", manual: "ידני" }[b.kind]}
                </Badge>
                <span className="ltr w-20 text-end text-xs text-slate-500">
                  {b.status === "success" ? formatBytes(b.dbBytes + b.filesBytes) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card title="מדיניות שמירה">
            <Row label="יומי" hint="03:30 כל לילה">
              <Badge>7 עותקים</Badge>
            </Row>
            <Row label="שבועי" hint="יום ראשון">
              <Badge>4 עותקים</Badge>
            </Row>
            <Row label="חודשי" hint="1 לחודש">
              <Badge>6 עותקים</Badge>
            </Row>
            <Row label="הצפנת גיבויים" hint="age / AES-256">
              <Badge tone="success">מופעל</Badge>
            </Row>
          </Card>
          <Card
            title="יעדים מרוחקים"
            description="אופציונלי. הגיבויים כבר מוצפנים לפני היציאה מהשרת."
          >
            {[
              { label: "NAS (rsync / SMB)", icon: <HardDrive /> },
              { label: "שרת נוסף (SSH)", icon: <Server /> },
              { label: "S3 תואם", icon: <Cloud /> },
            ].map((d) => (
              <Row key={d.label} label={d.label}>
                <Badge>לא מוגדר</Badge>
              </Row>
            ))}
          </Card>
          <Button variant="danger" className="w-full" onClick={() => setRestore(true)}>
            <ArchiveRestore /> שחזור מגיבוי
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={restore}
        onOpenChange={setRestore}
        title="שחזור מגיבוי"
        description="השחזור מחליף את כל נתוני הכספת הנוכחיים בתוכן הגיבוי. גיבוי של המצב הנוכחי ייווצר אוטומטית לפני השחזור. בגרסה המלאה השחזור מתבצע עם scripts/restore.sh."
        typeToConfirm="שחזר"
        confirmLabel="שחזור"
        onConfirm={() => toast("בפרוטוטייפ לא מתבצע שחזור", "info")}
      />
    </div>
  );
}

function CategoryForm({ cat, onClose }: { cat: Category | null; onClose: () => void }) {
  const [c, setC] = useState<Category>(
    cat ?? { id: vault.newId("c-"), name: "", icon: "folder", color: "violet", section: "all" },
  );
  const tone: Tone = isTone(c.color) ? c.color : "slate";
  return (
    <>
      <div className="mb-5 flex items-center gap-4 rounded-2xl bg-white/[0.03] p-4">
        <IconTile tone={tone} size="lg">
          <CategoryIcon name={c.icon} />
        </IconTile>
        <div>
          <div className="font-semibold text-white">{c.name || "שם הקטגוריה"}</div>
          <div className="text-xs text-slate-500">{c.description || "תצוגה מקדימה"}</div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם" htmlFor="cat-name">
          <Input
            id="cat-name"
            value={c.name}
            onChange={(e) => setC({ ...c, name: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="אזור" htmlFor="cat-section">
          <Select
            id="cat-section"
            value={c.section}
            onChange={(e) => setC({ ...c, section: e.target.value as Category["section"] })}
          >
            <option value="all">כל האזורים</option>
            <option value="passwords">סיסמאות</option>
            <option value="network">רשת</option>
            <option value="records">רישומים</option>
            <option value="cards">כרטיסים</option>
            <option value="documents">מסמכים</option>
          </Select>
        </Field>
        <Field label="תיאור" htmlFor="cat-desc" className="sm:col-span-2">
          <Input
            id="cat-desc"
            value={c.description ?? ""}
            onChange={(e) => setC({ ...c, description: e.target.value })}
          />
        </Field>
        <Field label="אייקון" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {Object.keys(CATEGORY_ICONS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setC({ ...c, icon: k })}
                aria-label={k}
                aria-pressed={c.icon === k}
                className={cn(
                  "grid size-10 cursor-pointer place-items-center rounded-xl border transition",
                  c.icon === k
                    ? "border-brand-400/60 bg-brand-500/15 text-brand-200"
                    : "border-white/10 text-slate-400 hover:text-white",
                )}
              >
                <CategoryIcon name={k} className="size-4.5" />
              </button>
            ))}
          </div>
        </Field>
        <Field label="צבע" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TONES) as Tone[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setC({ ...c, color: t })}
                aria-label={t}
                aria-pressed={c.color === t}
                className={cn(
                  "size-8 cursor-pointer rounded-lg bg-gradient-to-br ring-2 transition",
                  TONES[t],
                  c.color === t ? "ring-white" : "ring-transparent",
                )}
              />
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          variant="primary"
          disabled={!c.name.trim()}
          onClick={() => {
            vault.upsertCategory(c);
            onClose();
          }}
        >
          שמירה
        </Button>
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
      </div>
    </>
  );
}

function CategoriesTab() {
  const s = useVault((x) => x);
  const toast = useToast();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const usage = (id: string) =>
    [...s.passwords, ...s.network, ...s.records, ...s.cards, ...s.documents].filter(
      (i) => i.categoryId === id,
    ).length;
  const edit = editing === "new" ? null : editing;
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card
        title="קטגוריות"
        description="נוצרות על ידך — שום קטגוריה אינה קבועה בקוד."
        className="xl:col-span-2"
        action={
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            <Plus /> קטגוריה
          </Button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {s.categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"
            >
              <IconTile tone={isTone(c.color) ? c.color : "slate"} size="sm">
                <CategoryIcon name={c.icon} />
              </IconTile>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{c.name}</div>
                <div className="text-xs text-slate-500">{usage(c.id)} פריטים</div>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setEditing(c)}
                aria-label="עריכה"
              >
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setDeleting(c)}
                aria-label="מחיקה"
                className="hover:text-rose-300"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </Card>
      <Card title="תגיות" description="כל פריט יכול לשאת מספר תגיות.">
        <div className="flex flex-wrap gap-2">
          {s.tags.map((t) => (
            <span
              key={t}
              className="ltr rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300"
            >
              #{t}
            </span>
          ))}
        </div>
      </Card>
      <Dialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        title={edit ? "עריכת קטגוריה" : "קטגוריה חדשה"}
        icon={
          <IconTile tone="violet" size="sm">
            <FolderTree />
          </IconTile>
        }
      >
        {editing !== null ? (
          <CategoryForm key={edit?.id ?? "new"} cat={edit} onClose={() => setEditing(null)} />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="מחיקת קטגוריה"
        description={`הפריטים בקטגוריה “${deleting?.name ?? ""}” יישארו, ללא קטגוריה.`}
        confirmLabel="מחיקה"
        onConfirm={() => {
          if (deleting) vault.removeCategory(deleting.id);
          toast("הקטגוריה נמחקה");
        }}
      />
    </div>
  );
}

function TrashTab() {
  const trash = useVault((s) => s.trash);
  const toast = useToast();
  const [purging, setPurging] = useState<string | "all" | null>(null);
  const [retention, setRetention] = useState(30);
  return (
    <Card
      title="סל מחזור"
      description={`פריטים שנמחקו נשמרים ${retention} יום ואז נמחקים לצמיתות, כולל הקבצים המוצפנים.`}
      action={
        <div className="flex gap-2">
          <Select
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            className="h-8 w-28 text-xs"
            aria-label="ימי שמירה"
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} יום
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="danger"
            disabled={!trash.length}
            onClick={() => setPurging("all")}
          >
            ריקון
          </Button>
        </div>
      }
    >
      {trash.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">סל המחזור ריק</p>
      ) : (
        <ul className="space-y-2">
          {trash.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-200">{t.title}</div>
                <div className="text-xs text-slate-500">
                  נמחק {relativeTime(t.deletedAt)} · יימחק לצמיתות {relativeTime(t.purgeAt)}
                </div>
              </div>
              <Badge>
                {
                  {
                    passwords: "סיסמה",
                    network: "רשת",
                    records: "רישום",
                    cards: "כרטיס",
                    documents: "מסמך",
                  }[t.kind]
                }
              </Badge>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  vault.restore(t.id);
                  toast("הפריט שוחזר");
                }}
              >
                <RotateCcw /> שחזור
              </Button>
              <Button size="sm" variant="danger" onClick={() => setPurging(t.id)}>
                <Trash2 /> מחיקה לצמיתות
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(v) => !v && setPurging(null)}
        title={purging === "all" ? "ריקון סל המחזור" : "מחיקה לצמיתות"}
        description="הנתונים המוצפנים יימחקו מהמסד ומהדיסק. לא ניתן לבטל פעולה זו (מלבד שחזור מגיבוי ישן)."
        typeToConfirm="מחק"
        confirmLabel="מחיקה לצמיתות"
        onConfirm={() => {
          if (purging === "all") trash.forEach((t) => vault.purge(t.id));
          else if (purging) vault.purge(purging);
          toast("נמחק לצמיתות");
        }}
      />
    </Card>
  );
}

function ExportTab() {
  const toast = useToast();
  const [pass, setPass] = useState({ a: "", b: "" });
  const [importPass, setImportPass] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card
        title="ייצוא כספת מוצפנת"
        description="קובץ .vault יחיד: הנתונים והקבצים מוצפנים ב־AES-256-GCM עם מפתח הנגזר מסיסמת הייצוא (Argon2id). לעולם לא JSON גלוי."
      >
        <div className="space-y-3">
          <Field
            label="סיסמת ייצוא"
            htmlFor="ex-a"
            hint="לפחות 14 תווים. בלעדיה אי אפשר לפתוח את הקובץ."
          >
            <Input
              id="ex-a"
              type="password"
              value={pass.a}
              onChange={(e) => setPass({ ...pass, a: e.target.value })}
              autoComplete="new-password"
              className="ltr text-right"
            />
          </Field>
          {pass.a ? <StrengthMeter password={pass.a} /> : null}
          <Field
            label="אימות"
            htmlFor="ex-b"
            error={pass.b && pass.b !== pass.a ? "אינו תואם" : undefined}
          >
            <Input
              id="ex-b"
              type="password"
              value={pass.b}
              onChange={(e) => setPass({ ...pass, b: e.target.value })}
              autoComplete="new-password"
              className="ltr text-right"
            />
          </Field>
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3 text-sm">
            <FileArchive className="text-brand-300 size-5" />
            <span className="ltr font-mono text-xs text-slate-300">
              private-vault-backup-{today}.vault
            </span>
          </div>
          <Button
            variant="primary"
            disabled={pass.a.length < 14 || pass.a !== pass.b}
            onClick={() => {
              setPass({ a: "", b: "" });
              toast("בגרסה המלאה הקובץ המוצפן יורד כאן", "info");
            }}
          >
            <Download /> ייצוא
          </Button>
        </div>
      </Card>
      <Card
        title="ייבוא"
        description="להעברת הכספת לשרת חדש או ל־Proxmox. הייבוא מחליף את התוכן הקיים אחרי גיבוי אוטומטי."
      >
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center hover:border-white/20">
            <Upload className="size-6 text-slate-400" />
            <span className="text-sm text-slate-300">{file ? file.name : "בחירת קובץ .vault"}</span>
            <input
              type="file"
              accept=".vault"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Field label="סיסמת הייצוא" htmlFor="im-p">
            <Input
              id="im-p"
              type="password"
              value={importPass}
              onChange={(e) => setImportPass(e.target.value)}
              autoComplete="off"
              className="ltr text-right"
            />
          </Field>
          <Button
            variant="secondary"
            disabled={!file || !importPass}
            onClick={() => setConfirmImport(true)}
          >
            <ArchiveRestore /> ייבוא
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirmImport}
        onOpenChange={setConfirmImport}
        title="ייבוא כספת"
        description="כל הנתונים הנוכחיים יוחלפו בתוכן הקובץ. גיבוי של המצב הנוכחי ייווצר קודם."
        typeToConfirm="ייבא"
        confirmLabel="ייבוא"
        onConfirm={() => {
          setImportPass("");
          toast("בפרוטוטייפ לא מתבצע ייבוא", "info");
        }}
      />
    </div>
  );
}

function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "security";
  const setTab = (t: Tab) => router.replace(`/settings?tab=${t}`, { scroll: false });
  const trashCount = useVault((s) => s.trash.length);
  return (
    <>
      <PageHeader
        title="הגדרות"
        subtitle="אבטחה, גיבוי, קטגוריות ונתונים"
        tone="slate"
        icon={<Settings />}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-6"
        items={[
          { value: "security", label: "אבטחה", icon: <ShieldCheck /> },
          { value: "sessions", label: "סשנים", icon: <MonitorSmartphone /> },
          { value: "backup", label: "גיבוי", icon: <DatabaseBackup /> },
          { value: "categories", label: "קטגוריות ותגיות", icon: <FolderTree /> },
          { value: "trash", label: "סל מחזור", icon: <Trash2 />, count: trashCount },
          { value: "export", label: "ייצוא / ייבוא", icon: <FileArchive /> },
        ]}
      />
      {tab === "security" ? <SecurityTab /> : null}
      {tab === "sessions" ? <SessionsTab /> : null}
      {tab === "backup" ? <BackupTab /> : null}
      {tab === "categories" ? <CategoriesTab /> : null}
      {tab === "trash" ? <TrashTab /> : null}
      {tab === "export" ? <ExportTab /> : null}
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
