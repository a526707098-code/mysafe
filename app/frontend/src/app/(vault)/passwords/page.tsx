"use client";
import { Suspense, useState } from "react";
import { ExternalLink, Eye, EyeOff, KeyRound, Plus, Wand2 } from "lucide-react";
import { useVault, vault } from "@/lib/vault-store";
import { api, ApiError } from "@/lib/api";
import { estimateEntropy } from "@/lib/password-generator";
import { hostOf, relativeTime } from "@/lib/format";
import type { PasswordItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IconTile } from "@/components/vault/icon-tile";
import { SecretField } from "@/components/vault/secret";
import { CopyText } from "@/components/vault/copy-text";
import { SiteAvatar } from "@/components/vault/site-avatar";
import { GeneratorDialog, StrengthMeter } from "@/components/vault/password-generator";
import {
  applyToolbar,
  CategoryPill,
  CategorySelect,
  PageHeader,
  RowActions,
  SectionToolbar,
  TagChips,
  TagInput,
} from "@/components/vault/bits";
import { useSectionPage } from "@/components/vault/hooks";

const STRENGTH = {
  weak: { label: "חלשה", tone: "danger" },
  fair: { label: "בינונית", tone: "warning" },
  strong: { label: "חזקה", tone: "success" },
} as const;

function PasswordForm({ item, onClose }: { item: PasswordItem | null; onClose: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<PasswordItem>(
    item ?? {
      id: vault.newId("p"),
      kind: "password",
      title: "",
      websiteName: "",
      url: "https://",
      username: "",
      tags: [],
      favorite: false,
      strength: "strong",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );
  // The existing password is never prefilled: leaving this empty keeps it unchanged.
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [gen, setGen] = useState(false);
  const [busy, setBusy] = useState(false);
  const urlOk =
    draft.url === "" || draft.url === "https://" || /^https?:\/\/[^\s]+$/i.test(draft.url);
  const valid = draft.title.trim() && urlOk && (item || password);

  const save = async () => {
    setBusy(true);
    try {
      const next = { ...draft };
      if (password) {
        const bits = estimateEntropy(password);
        next.strength = bits < 45 ? "weak" : bits < 70 ? "fair" : "strong";
        await api.storeSecret(next.id, password);
      }
      await vault.save(next);
      setPassword("");
      toast(item ? "הרשומה עודכנה" : "הסיסמה נשמרה");
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.userMessage : "השמירה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="כותרת" htmlFor="pw-title">
          <Input
            id="pw-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="שם האתר" htmlFor="pw-site">
          <Input
            id="pw-site"
            value={draft.websiteName}
            onChange={(e) => setDraft({ ...draft, websiteName: e.target.value })}
          />
        </Field>
        <Field
          label="כתובת האתר"
          htmlFor="pw-url"
          className="sm:col-span-2"
          error={urlOk ? undefined : "כתובת לא תקינה"}
        >
          <Input
            id="pw-url"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            className="ltr text-left"
            inputMode="url"
          />
        </Field>
        <Field label="שם משתמש / אימייל" htmlFor="pw-user" className="sm:col-span-2">
          <Input
            id="pw-user"
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            className="ltr text-left"
            autoComplete="off"
          />
        </Field>
        <Field
          label="סיסמה"
          htmlFor="pw-pass"
          className="sm:col-span-2"
          hint={
            item ? "השאר ריק כדי לא לשנות את הסיסמה הקיימת" : "מוצפנת ב־AES-256-GCM לפני השמירה"
          }
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="pw-pass"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ltr pe-10 text-left font-mono"
                autoComplete="new-password"
                placeholder={item ? "•••••••• (ללא שינוי)" : ""}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute top-1/2 left-2 -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-slate-500 hover:text-white"
                aria-label={show ? "הסתרה" : "הצגה"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button variant="secondary" className="h-11" onClick={() => setGen(true)}>
              <Wand2 /> יצירה
            </Button>
          </div>
          {password ? <StrengthMeter password={password} /> : null}
        </Field>
        <Field label="קטגוריה" htmlFor="pw-cat">
          <CategorySelect
            id="pw-cat"
            value={draft.categoryId}
            onChange={(v) => setDraft({ ...draft, categoryId: v })}
          />
        </Field>
        <div />
        <Field label="תגיות" className="sm:col-span-2">
          <TagInput value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} />
        </Field>
        <Field
          label="הערות"
          htmlFor="pw-notes"
          className="sm:col-span-2"
          hint="ההערות נשמרות מוצפנות"
        >
          <Textarea
            id="pw-notes"
            value={draft.notes ?? ""}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="primary" onClick={save} disabled={!valid} loading={busy}>
          שמירה
        </Button>
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
      </div>
      <GeneratorDialog
        open={gen}
        onOpenChange={setGen}
        onUse={(v) => {
          setPassword(v);
          setShow(true);
        }}
      />
    </>
  );
}

function PasswordsView() {
  const items = useVault((s) => s.passwords);
  const page = useSectionPage<PasswordItem>();
  const [gen, setGen] = useState(false);
  const toast = useToast();
  const list = applyToolbar(items, page.toolbar, (p) => [
    p.username,
    p.url,
    p.websiteName,
    p.notes,
  ]);
  const edit = page.editing === "new" ? null : page.editing;

  return (
    <>
      <PageHeader
        title="סיסמאות ואתרים"
        subtitle={`${items.length} רשומות · הסיסמאות מוצפנות ומוסתרות כברירת מחדל`}
        tone="violet"
        icon={<KeyRound />}
        actions={
          <>
            <Button variant="secondary" onClick={() => setGen(true)}>
              <Wand2 /> מחולל סיסמאות
            </Button>
            <Button variant="primary" onClick={() => page.setEditing("new")}>
              <Plus /> סיסמה חדשה
            </Button>
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={
            <IconTile tone="violet" size="xl">
              <KeyRound />
            </IconTile>
          }
          title="אין עדיין סיסמאות"
          description="שמור כאן פרטי כניסה לאתרים ושירותים. כל סיסמה מוצפנת לפני שהיא נשמרת."
          action={
            <Button variant="primary" size="lg" onClick={() => page.setEditing("new")}>
              <Plus /> הוסף סיסמה ראשונה
            </Button>
          }
        />
      ) : (
        <>
          <SectionToolbar
            state={page.toolbar}
            onChange={page.setToolbar}
            placeholder="סינון לפי כותרת, משתמש, כתובת..."
          />
          {list.length === 0 ? (
            <p className="glass rounded-3xl py-14 text-center text-sm text-slate-500">
              אין תוצאות לסינון הנוכחי
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="glass hidden overflow-hidden rounded-3xl lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-right text-xs text-slate-500">
                      <th className="px-5 py-3.5 font-medium">אתר</th>
                      <th className="px-3 py-3.5 font-medium">משתמש</th>
                      <th className="w-64 px-3 py-3.5 font-medium">סיסמה</th>
                      <th className="px-3 py-3.5 font-medium">קטגוריה</th>
                      <th className="px-3 py-3.5 font-medium">עודכן</th>
                      <th className="px-3 py-3.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr
                        key={p.id}
                        className="group border-b border-white/[0.04] transition last:border-0 hover:bg-white/[0.025]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <SiteAvatar name={p.websiteName || p.title} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 font-medium text-white">
                                {p.title}
                                <Badge tone={STRENGTH[p.strength].tone}>
                                  {STRENGTH[p.strength].label}
                                </Badge>
                              </div>
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ltr hover:text-brand-300 inline-flex items-center gap-1 text-xs text-slate-500"
                              >
                                {hostOf(p.url)} <ExternalLink className="size-3" />
                              </a>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-52 px-3 py-3 text-slate-300">
                          <CopyText value={p.username} />
                        </td>
                        <td className="px-3 py-3">
                          <SecretField kind="password" id={p.id} label={p.title} compact />
                        </td>
                        <td className="px-3 py-3">
                          <CategoryPill id={p.categoryId} />
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {relativeTime(p.updatedAt)}
                        </td>
                        <td className="px-3 py-3">
                          <RowActions
                            item={p}
                            onEdit={() => page.setEditing(p)}
                            onDelete={() => page.setDeleting(p)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile / tablet cards */}
              <div className="grid gap-3 md:grid-cols-2 lg:hidden">
                {list.map((p) => (
                  <article key={p.id} className="glass rounded-3xl p-4">
                    <div className="flex items-start gap-3">
                      <SiteAvatar name={p.websiteName || p.title} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-white">{p.title}</div>
                        <div className="ltr truncate text-end text-xs text-slate-500">
                          {hostOf(p.url)}
                        </div>
                      </div>
                      <Badge tone={STRENGTH[p.strength].tone}>{STRENGTH[p.strength].label}</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-sm text-slate-300">
                        <span className="text-xs text-slate-500">משתמש</span>
                        <CopyText value={p.username} />
                      </div>
                      <SecretField kind="password" id={p.id} label={p.title} />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <TagChips tags={p.tags} />
                      <RowActions
                        item={p}
                        onEdit={() => page.setEditing(p)}
                        onDelete={() => page.setDeleting(p)}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Dialog
        open={page.editing !== null}
        onOpenChange={(v) => !v && page.closeEditor()}
        title={edit ? `עריכת ${edit.title}` : "סיסמה חדשה"}
        size="lg"
        icon={
          <IconTile tone="violet" size="sm">
            <KeyRound />
          </IconTile>
        }
      >
        {page.editing !== null ? (
          <PasswordForm key={edit?.id ?? "new"} item={edit} onClose={page.closeEditor} />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={page.deleting !== null}
        onOpenChange={(v) => !v && page.setDeleting(null)}
        title="העברה לסל המחזור"
        description={`“${page.deleting?.title ?? ""}” תועבר לסל המחזור ותימחק לצמיתות אחרי 30 יום. ניתן לשחזר עד אז.`}
        confirmLabel="מחיקה"
        onConfirm={() => {
          if (page.deleting) vault.remove(page.deleting);
          toast("הועבר לסל המחזור");
        }}
      />
      <GeneratorDialog open={gen} onOpenChange={setGen} />
    </>
  );
}

export default function PasswordsPage() {
  return (
    <Suspense>
      <PasswordsView />
    </Suspense>
  );
}
