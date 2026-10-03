"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  Camera,
  Download,
  FileText,
  FolderOpen,
  ImageIcon,
  Link2,
  Lock,
  Plus,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { useVault, vault } from "@/lib/vault-store";
import { formatBytes, formatDate } from "@/lib/format";
import { ACCEPT, validateUpload, type AllowedMime } from "@/lib/upload";
import { cn } from "@/lib/cn";
import type { DocumentItem, SectionKey } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IconTile } from "@/components/vault/icon-tile";
import {
  applyToolbar,
  CategoryPill,
  CategorySelect,
  FavoriteButton,
  PageHeader,
  SectionToolbar,
  TagInput,
} from "@/components/vault/bits";
import { useSectionPage } from "@/components/vault/hooks";

/**
 * Object URLs for files picked in this browser session. Real previews are
 * streamed from GET /api/files/:id (authenticated, decrypted server-side,
 * Content-Disposition: inline, no-store) and turned into blob: URLs the same way.
 */
const previews = new Map<string, string>();

function Thumb({ doc, className }: { doc: DocumentItem; className?: string }) {
  const url = previews.get(doc.id);
  const isPdf = doc.mime === "application/pdf";
  return (
    <div
      className={cn(
        "to-ink-900 relative grid place-items-center overflow-hidden bg-gradient-to-br",
        doc.previewTone,
        className,
      )}
    >
      {url && !isPdf ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL, not optimisable
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          <div className="grid-bg absolute inset-0 opacity-60" />
          <div className="relative flex flex-col items-center gap-2">
            <span className="grid size-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
              {isPdf ? (
                <FileText className="size-7 text-white/80" />
              ) : (
                <ImageIcon className="size-7 text-white/80" />
              )}
            </span>
            <span className="ltr text-[10px] font-semibold tracking-widest text-white/50">
              {isPdf ? "PDF" : doc.mime.split("/")[1]?.toUpperCase()}
            </span>
          </div>
        </>
      )}
      <span className="bg-ink-950/60 absolute top-2.5 left-2.5 flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] text-emerald-300 backdrop-blur">
        <Lock className="size-3" /> מוצפן
      </span>
    </div>
  );
}

function UploadForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const state = useVault((s) => s);
  const [file, setFile] = useState<{ file: File; mime: AllowedMime; url: string } | null>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const [meta, setMeta] = useState({
    title: "",
    description: "",
    categoryId: undefined as string | undefined,
    tags: [] as string[],
    related: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (file && !previews.has(file.url)) URL.revokeObjectURL(file.url);
    },
    [file],
  );

  const accept = async (f: File | undefined) => {
    if (!f) return;
    const v = await validateUpload(f);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError("");
    setFile({ file: f, mime: v.mime, url: URL.createObjectURL(f) });
    setMeta((m) => ({ ...m, title: m.title || f.name.replace(/\.[^.]+$/, "") }));
  };

  const relatedOptions: { kind: SectionKey; id: string; title: string }[] = [
    ...state.passwords.map((p) => ({ kind: "passwords" as const, id: p.id, title: p.title })),
    ...state.network.map((n) => ({ kind: "network" as const, id: n.id, title: n.title })),
    ...state.records.map((r) => ({ kind: "records" as const, id: r.id, title: r.title })),
    ...state.cards.map((c) => ({ kind: "cards" as const, id: c.id, title: c.title })),
  ];

  return (
    <>
      {!file ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void accept(e.dataTransfer.files[0]);
          }}
          className={cn(
            "relative flex flex-col items-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition",
            drag ? "border-brand-400/60 bg-brand-500/10" : "border-white/10 bg-white/[0.02]",
          )}
        >
          <IconTile tone="blue" size="lg">
            <UploadCloud />
          </IconTile>
          <p className="mt-4 font-medium text-white">גרור קובץ לכאן</p>
          <p className="mt-1 text-xs text-slate-500">JPEG · PNG · WEBP · PDF · עד 20MB</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" onClick={() => cameraRef.current?.click()}>
              <Camera /> צילום במצלמה
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload /> בחירת קובץ
            </Button>
          </div>
          {/* capture opens the rear camera directly on phones that support it */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => void accept(e.target.files?.[0])}
          />
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void accept(e.target.files?.[0])}
          />
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="bg-ink-900 grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl">
            {file.mime === "application/pdf" ? (
              <FileText className="size-7 text-slate-400" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- blob: preview
              <img src={file.url} alt="" className="size-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">{file.file.name}</div>
            <div className="text-xs text-slate-500">
              {formatBytes(file.file.size)} · יישמר בשם אקראי ומוצפן
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
            החלפה
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="כותרת" htmlFor="doc-title">
          <Input
            id="doc-title"
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
          />
        </Field>
        <Field label="קטגוריה" htmlFor="doc-cat">
          <CategorySelect
            id="doc-cat"
            value={meta.categoryId}
            onChange={(v) => setMeta({ ...meta, categoryId: v })}
          />
        </Field>
        <Field label="תיאור" htmlFor="doc-desc" className="sm:col-span-2">
          <Textarea
            id="doc-desc"
            value={meta.description}
            onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            className="min-h-16"
          />
        </Field>
        <Field label="קישור לרשומה" htmlFor="doc-rel" className="sm:col-span-2">
          <Select
            id="doc-rel"
            value={meta.related}
            onChange={(e) => setMeta({ ...meta, related: e.target.value })}
          >
            <option value="">ללא</option>
            {relatedOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="תגיות" className="sm:col-span-2">
          <TagInput value={meta.tags} onChange={(tags) => setMeta({ ...meta, tags })} />
        </Field>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          variant="primary"
          disabled={!file || !meta.title.trim()}
          loading={busy}
          onClick={async () => {
            if (!file) return;
            setBusy(true);
            await new Promise((r) => setTimeout(r, 600));
            const rel = relatedOptions.find((o) => o.id === meta.related);
            const doc = vault.upsert<DocumentItem>({
              id: vault.newId("d"),
              kind: "document",
              title: meta.title.trim(),
              description: meta.description || undefined,
              mime: file.mime,
              sizeBytes: file.file.size,
              categoryId: meta.categoryId,
              tags: meta.tags,
              favorite: false,
              previewTone: "from-blue-500/30",
              relatedTo: rel,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            previews.set(doc.id, file.url);
            vault.log("FILE_UPLOADED", `${doc.id} · ${doc.title}`);
            toast("הקובץ הועלה והוצפן");
            setBusy(false);
            onClose();
          }}
        >
          <Upload /> העלאה מוצפנת
        </Button>
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
      </div>
    </>
  );
}

function Preview({
  doc,
  onClose,
  onDelete,
}: {
  doc: DocumentItem | null;
  onClose: () => void;
  onDelete: (d: DocumentItem) => void;
}) {
  useEffect(() => {
    if (doc) vault.log("FILE_VIEWED", `${doc.id} · ${doc.title}`);
  }, [doc]);
  if (!doc) return null;
  const url = previews.get(doc.id);
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={doc.title}
      description={doc.description}
      size="xl"
      icon={
        <IconTile tone="blue" size="sm">
          {doc.mime === "application/pdf" ? <FileText /> : <ImageIcon />}
        </IconTile>
      }
      footer={
        <>
          <Button
            variant="secondary"
            disabled={!url}
            onClick={() => url && window.open(url, "_blank", "noopener")}
          >
            <Download /> פתיחה
          </Button>
          <Button variant="danger" onClick={() => onDelete(doc)}>
            <Trash2 /> מחיקה
          </Button>
        </>
      }
    >
      <div className="bg-ink-950 overflow-hidden rounded-2xl border border-white/[0.07]">
        {url && doc.mime === "application/pdf" ? (
          <iframe src={url} title={doc.title} className="h-[60vh] w-full" />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: preview
          <img src={url} alt={doc.title} className="mx-auto max-h-[60vh] object-contain" />
        ) : (
          <div className="flex h-[45vh] flex-col items-center justify-center gap-3">
            <Thumb doc={doc} className="size-40 rounded-3xl" />
            <p className="max-w-sm text-center text-xs text-slate-500">
              קובץ דוגמה. בגרסה המלאה התצוגה נטענת מנקודת קצה מאומתת ומפוענחת בשרת, ללא כתובת
              ציבורית לקובץ.
            </p>
          </div>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">גודל</dt>
          <dd className="ltr text-end text-slate-200 sm:text-start">
            {formatBytes(doc.sizeBytes)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">הועלה</dt>
          <dd className="text-slate-200">{formatDate(doc.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">קטגוריה</dt>
          <dd>
            <CategoryPill id={doc.categoryId} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">מקושר ל</dt>
          <dd className="text-slate-200">{doc.relatedTo?.title ?? "—"}</dd>
        </div>
      </dl>
    </Dialog>
  );
}

function DocumentsView() {
  const items = useVault((s) => s.documents);
  const categories = useVault((s) =>
    s.categories.filter((c) => c.section === "documents" || c.section === "all"),
  );
  const page = useSectionPage<DocumentItem>();
  const toast = useToast();
  const [viewing, setViewing] = useState<DocumentItem | null>(null);
  const list = applyToolbar(items, page.toolbar, (d) => [d.description, d.relatedTo?.title]);

  return (
    <>
      <PageHeader
        title="מסמכים"
        subtitle={`${items.length} קבצים · ${formatBytes(items.reduce((n, d) => n + d.sizeBytes, 0))} · מוצפנים במנוחה`}
        tone="blue"
        icon={<FolderOpen />}
        actions={
          <Button variant="primary" onClick={() => page.setEditing("new")}>
            <Plus /> העלאת מסמך
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={
            <IconTile tone="blue" size="xl">
              <FolderOpen />
            </IconTile>
          }
          title="אין עדיין מסמכים"
          description="צלם חשבוניות, תעודות אחריות ומסמכים אישיים ישירות מהטלפון. כל קובץ מוצפן לפני שמירתו."
          action={
            <Button variant="primary" size="lg" onClick={() => page.setEditing("new")}>
              <Camera /> העלה מסמך ראשון
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => page.setToolbar({ ...page.toolbar, category: "" })}
              className={cn(
                "shrink-0 cursor-pointer rounded-xl border px-3 py-1.5 text-sm",
                !page.toolbar.category
                  ? "border-blue-400/40 bg-blue-500/15 text-blue-100"
                  : "border-white/10 text-slate-400 hover:text-white",
              )}
            >
              הכל
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => page.setToolbar({ ...page.toolbar, category: c.id })}
                className={cn(
                  "shrink-0 cursor-pointer rounded-xl border px-3 py-1.5 text-sm",
                  page.toolbar.category === c.id
                    ? "border-blue-400/40 bg-blue-500/15 text-blue-100"
                    : "border-white/10 text-slate-400 hover:text-white",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <SectionToolbar
            state={page.toolbar}
            onChange={page.setToolbar}
            placeholder="חיפוש מסמך..."
          />
          {list.length === 0 ? (
            <p className="glass rounded-3xl py-14 text-center text-sm text-slate-500">
              אין תוצאות לסינון הנוכחי
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {list.map((d) => (
                <article
                  key={d.id}
                  className="glass group overflow-hidden rounded-3xl transition hover:-translate-y-0.5 hover:border-white/15"
                >
                  <button
                    type="button"
                    onClick={() => setViewing(d)}
                    className="block w-full cursor-pointer"
                    aria-label={`תצוגה מקדימה של ${d.title}`}
                  >
                    <Thumb
                      doc={d}
                      className="aspect-[4/3] transition duration-500 group-hover:scale-[1.02]"
                    />
                  </button>
                  <div className="p-3.5">
                    <div className="flex items-start gap-1">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                        {d.title}
                      </h3>
                      <FavoriteButton item={d} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="ltr">{formatBytes(d.sizeBytes)}</span>
                      <span>{formatDate(d.createdAt)}</span>
                    </div>
                    {d.relatedTo ? (
                      <Badge tone="brand" className="mt-2 max-w-full">
                        <Link2 /> <span className="truncate">{d.relatedTo.title}</span>
                      </Badge>
                    ) : null}
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
        title="העלאת מסמך"
        description="הקובץ נבדק (סוג, סיומת, תוכן וגודל), מוצפן ונשמר בשם אקראי."
        size="lg"
        icon={
          <IconTile tone="blue" size="sm">
            <Upload />
          </IconTile>
        }
      >
        {page.editing !== null ? <UploadForm onClose={page.closeEditor} /> : null}
      </Dialog>
      <Preview
        doc={viewing}
        onClose={() => setViewing(null)}
        onDelete={(d) => {
          setViewing(null);
          page.setDeleting(d);
        }}
      />
      <ConfirmDialog
        open={page.deleting !== null}
        onOpenChange={(v) => !v && page.setDeleting(null)}
        title="מחיקת קובץ"
        description={`“${page.deleting?.title ?? ""}” יועבר לסל המחזור. הקובץ המוצפן יימחק מהדיסק לצמיתות אחרי 30 יום.`}
        confirmLabel="מחיקה"
        onConfirm={() => {
          if (page.deleting) vault.remove(page.deleting);
          toast("הועבר לסל המחזור");
        }}
      />
    </>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsView />
    </Suspense>
  );
}
