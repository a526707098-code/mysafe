"use client";
import { Suspense, useRef, useState } from "react";
import { FileText, Lock, Paperclip, Plus, Shield, Trash2 } from "lucide-react";
import { useVault, vault } from "@/lib/vault-store";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { ACCEPT, validateUpload } from "@/lib/upload";
import { cn } from "@/lib/cn";
import type { CustomField, RecordItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { IconTile } from "@/components/vault/icon-tile";
import { SecretField } from "@/components/vault/secret";
import { CopyText } from "@/components/vault/copy-text";
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

interface DraftField extends CustomField {
  /** New plaintext for a sensitive field; empty keeps the stored value. */
  secret?: string;
}

function RecordForm({ item, onClose }: { item: RecordItem | null; onClose: () => void }) {
  const toast = useToast();
  const docs = useVault((s) => s.documents);
  const fileRef = useRef<HTMLInputElement>(null);
  const [r, setR] = useState<RecordItem>(
    item ?? {
      id: vault.newId("r"),
      kind: "record",
      title: "",
      fields: [],
      tags: [],
      favorite: false,
      attachmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );
  const [fields, setFields] = useState<DraftField[]>(
    r.fields.length ? r.fields : [{ id: vault.newId("f"), name: "", value: "", sensitive: false }],
  );
  const [uploadError, setUploadError] = useState("");

  const update = (id: string, patch: Partial<DraftField>) =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const valid = r.title.trim() && fields.every((f) => f.name.trim());

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="כותרת" htmlFor="rc-title">
          <Input
            id="rc-title"
            value={r.title}
            onChange={(e) => setR({ ...r, title: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="קטגוריה" htmlFor="rc-cat">
          <CategorySelect
            id="rc-cat"
            value={r.categoryId}
            onChange={(v) => setR({ ...r, categoryId: v })}
          />
        </Field>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">שדות מותאמים</h3>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="size-3.5" /> שדה רגיש מוצפן ומוסתר
          </span>
        </div>
        <div className="space-y-2">
          {fields.map((f) => (
            <div
              key={f.id}
              className={cn(
                "grid gap-2 rounded-2xl border p-3 sm:grid-cols-[1fr_1.4fr_auto_auto] sm:items-center",
                f.sensitive
                  ? "border-amber-500/20 bg-amber-500/[0.04]"
                  : "border-white/[0.06] bg-white/[0.02]",
              )}
            >
              <Input
                value={f.name}
                onChange={(e) => update(f.id, { name: e.target.value })}
                placeholder="שם השדה (למשל: מספר לקוח)"
                aria-label="שם השדה"
              />
              {f.sensitive ? (
                <Input
                  type="password"
                  value={f.secret ?? ""}
                  onChange={(e) => update(f.id, { secret: e.target.value })}
                  placeholder={item && !f.secret ? "•••••• (ללא שינוי)" : "ערך רגיש"}
                  className="ltr text-left font-mono"
                  autoComplete="off"
                  aria-label="ערך"
                />
              ) : (
                <Input
                  value={f.value ?? ""}
                  onChange={(e) => update(f.id, { value: e.target.value })}
                  placeholder="ערך"
                  aria-label="ערך"
                  dir="auto"
                />
              )}
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <Switch
                  label="רגיש"
                  checked={f.sensitive}
                  onChange={(v) =>
                    update(f.id, {
                      sensitive: v,
                      value: v ? undefined : f.value,
                      secret: v ? f.value : undefined,
                    })
                  }
                />
                רגיש
              </label>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}
                aria-label="הסרת שדה"
                className="justify-self-end hover:text-rose-300"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() =>
            setFields((fs) => [
              ...fs,
              { id: vault.newId("f"), name: "", value: "", sensitive: false },
            ])
          }
        >
          <Plus /> הוספת שדה
        </Button>
      </div>

      <div className="mt-6 grid gap-4">
        <Field label="תגיות">
          <TagInput value={r.tags} onChange={(tags) => setR({ ...r, tags })} />
        </Field>
        <Field label="הערות" htmlFor="rc-notes" hint="ההערות מוצפנות">
          <Textarea
            id="rc-notes"
            value={r.notes ?? ""}
            onChange={(e) => setR({ ...r, notes: e.target.value })}
          />
        </Field>
        <Field label="קבצים מצורפים" error={uploadError || undefined}>
          <div className="flex flex-wrap gap-2">
            {r.attachmentIds.map((id) => {
              const d = docs.find((x) => x.id === id);
              return d ? (
                <Badge key={id} tone="brand">
                  <Paperclip /> {d.title}
                </Badge>
              ) : null;
            })}
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Paperclip /> צירוף תמונה / PDF
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const v = await validateUpload(file);
                if (!v.ok) return setUploadError(v.error);
                setUploadError("");
                const doc = vault.upsert({
                  id: vault.newId("d"),
                  kind: "document",
                  title: file.name.replace(/\.[^.]+$/, ""),
                  mime: v.mime,
                  sizeBytes: file.size,
                  tags: [],
                  favorite: false,
                  previewTone: "from-amber-500/30",
                  relatedTo: { kind: "records", id: r.id, title: r.title || "רישום" },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
                vault.log("FILE_UPLOADED", `${doc.id} · ${doc.title}`);
                setR((x) => ({ ...x, attachmentIds: [...x.attachmentIds, doc.id] }));
              }}
            />
          </div>
        </Field>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          variant="primary"
          disabled={!valid}
          onClick={async () => {
            for (const f of fields)
              if (f.sensitive && f.secret) await api.storeSecret(f.id, f.secret);
            vault.upsert({
              ...r,
              fields: fields.map<CustomField>((f) => ({
                id: f.id,
                name: f.name,
                sensitive: f.sensitive,
                value: f.sensitive ? undefined : f.value,
              })),
            });
            toast(item ? "הרישום עודכן" : "הרישום נשמר");
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

function RecordsView() {
  const items = useVault((s) => s.records);
  const page = useSectionPage<RecordItem>();
  const toast = useToast();
  const list = applyToolbar(items, page.toolbar, (r) => [
    r.notes,
    ...r.fields.flatMap((f) => [f.name, f.sensitive ? undefined : f.value]),
  ]);
  const edit = page.editing === "new" ? null : page.editing;

  return (
    <>
      <PageHeader
        title="רישומים"
        subtitle="רשומות גמישות עם שדות חופשיים — שדות רגישים מוצפנים"
        tone="amber"
        icon={<FileText />}
        actions={
          <Button variant="primary" onClick={() => page.setEditing("new")}>
            <Plus /> רישום חדש
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={
            <IconTile tone="amber" size="xl">
              <FileText />
            </IconTile>
          }
          title="אין עדיין רישומים"
          description="מספרי לקוח, פוליסות, קודים חשובים ופרטי ספקים — עם שדות מותאמים אישית."
          action={
            <Button variant="primary" size="lg" onClick={() => page.setEditing("new")}>
              <Plus /> הוסף רישום ראשון
            </Button>
          }
        />
      ) : (
        <>
          <SectionToolbar
            state={page.toolbar}
            onChange={page.setToolbar}
            placeholder="חיפוש בכותרת, שמות שדות, הערות..."
          />
          {list.length === 0 ? (
            <p className="glass rounded-3xl py-14 text-center text-sm text-slate-500">
              אין תוצאות לסינון הנוכחי
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {list.map((r) => (
                <article
                  key={r.id}
                  className="glass group flex flex-col rounded-4xl p-5 transition hover:border-white/15"
                >
                  <div className="flex items-start gap-3">
                    <IconTile tone="amber" size="sm">
                      <FileText />
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-white">{r.title}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <CategoryPill id={r.categoryId} />
                        <span className="text-[11px] text-slate-500">
                          {relativeTime(r.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <dl className="mt-4 flex-1 space-y-2">
                    {r.fields.map((f) => (
                      <div key={f.id} className="grid grid-cols-[7rem_1fr] items-center gap-2">
                        <dt className="flex items-center gap-1 truncate text-xs text-slate-500">
                          {f.sensitive ? (
                            <Shield className="size-3 shrink-0 text-amber-400" />
                          ) : null}
                          {f.name}
                        </dt>
                        <dd className="min-w-0">
                          {f.sensitive ? (
                            <SecretField kind="field" id={f.id} label={f.name} compact multiline />
                          ) : (
                            <CopyText value={f.value ?? ""} className="text-sm text-slate-200" />
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {r.notes ? (
                    <p className="mt-3 line-clamp-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                      {r.notes}
                    </p>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-3">
                    <div className="flex items-center gap-2">
                      <TagChips tags={r.tags} />
                      {r.attachmentIds.length ? (
                        <Badge>
                          <Paperclip /> {r.attachmentIds.length}
                        </Badge>
                      ) : null}
                    </div>
                    <RowActions
                      item={r}
                      onEdit={() => page.setEditing(r)}
                      onDelete={() => page.setDeleting(r)}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      <Dialog
        open={page.editing !== null}
        onOpenChange={(v) => !v && page.closeEditor()}
        title={edit ? `עריכת ${edit.title}` : "רישום חדש"}
        size="lg"
        icon={
          <IconTile tone="amber" size="sm">
            <FileText />
          </IconTile>
        }
      >
        {page.editing !== null ? (
          <RecordForm key={edit?.id ?? "new"} item={edit} onClose={page.closeEditor} />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={page.deleting !== null}
        onOpenChange={(v) => !v && page.setDeleting(null)}
        title="העברה לסל המחזור"
        description={`“${page.deleting?.title ?? ""}” יועבר לסל המחזור למשך 30 יום.`}
        confirmLabel="מחיקה"
        onConfirm={() => {
          if (page.deleting) vault.remove(page.deleting);
          toast("הועבר לסל המחזור");
        }}
      />
    </>
  );
}

export default function RecordsPage() {
  return (
    <Suspense>
      <RecordsView />
    </Suspense>
  );
}
