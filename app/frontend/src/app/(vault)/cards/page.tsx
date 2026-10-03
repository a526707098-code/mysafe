"use client";
import { Suspense, useState } from "react";
import {
  Check,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Info,
  Nfc,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useVault, vault } from "@/lib/vault-store";
import { api, ApiError } from "@/lib/api";
import { maskedCard } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CardBrand, CardItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IconTile } from "@/components/vault/icon-tile";
import { RevealTimer, useSecret } from "@/components/vault/secret";
import {
  applyToolbar,
  CategorySelect,
  FavoriteButton,
  PageHeader,
  SectionToolbar,
  TagInput,
} from "@/components/vault/bits";
import { useSectionPage } from "@/components/vault/hooks";

const GRADIENTS: Record<CardItem["gradient"], string> = {
  violet: "from-violet-600 via-indigo-700 to-slate-900",
  emerald: "from-emerald-500 via-teal-700 to-slate-900",
  slate: "from-slate-500 via-slate-700 to-slate-950",
  rose: "from-rose-500 via-pink-700 to-slate-900",
  amber: "from-amber-500 via-orange-700 to-slate-900",
};
const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "VISA",
  mastercard: "mastercard",
  amex: "AMEX",
  isracard: "ISRACARD",
  diners: "Diners",
  other: "CARD",
};

/** Luhn check: catches typos in the full number before it is encrypted. */
function luhn(num: string) {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function PaymentCard({
  card,
  onEdit,
  onDelete,
}: {
  card: CardItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const s = useSecret("card", card.id, card.title);
  const [number, expiry] = s.value?.split("|") ?? [];
  return (
    <div className="group space-y-3">
      <div
        className={cn(
          "relative aspect-[1.586] overflow-hidden rounded-[1.6rem] bg-gradient-to-br p-5 shadow-2xl ring-1 ring-white/15 transition-transform duration-500 ring-inset group-hover:-translate-y-1 sm:p-6",
          GRADIENTS[card.gradient],
        )}
      >
        <div className="pointer-events-none absolute -top-1/2 -left-1/4 size-[120%] rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgb(255_255_255/0.12)_50%,transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-semibold text-white/90">{card.title}</div>
              <div className="text-xs text-white/60">{card.issuer}</div>
            </div>
            <div className="ltr text-lg font-extrabold tracking-wider text-white/90 italic">
              {BRAND_LABEL[card.brand]}
            </div>
          </div>
          <div className="ltr flex items-center gap-3">
            <span className="h-8 w-11 rounded-md bg-gradient-to-br from-yellow-200 via-amber-300 to-yellow-600 ring-1 ring-black/20" />
            <Nfc className="size-6 text-white/60" />
          </div>
          <div
            className="ltr font-mono text-lg tracking-[0.12em] text-white drop-shadow sm:text-xl"
            aria-live="polite"
          >
            {number ?? maskedCard(card.last4)}
          </div>
          <div className="ltr flex items-end justify-between text-white/80">
            <div>
              <div className="text-[9px] tracking-widest text-white/50 uppercase">Card holder</div>
              <div className="text-sm font-medium tracking-wide">{card.holder}</div>
            </div>
            <div className="text-end">
              <div className="text-[9px] tracking-widest text-white/50 uppercase">Expires</div>
              <div className="font-mono text-sm">{expiry ?? "••/••"}</div>
            </div>
          </div>
        </div>
        <RevealTimer expiresAt={s.expiresAt} total={s.revealMs} />
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={s.value ? "primary" : "secondary"}
          onClick={s.reveal}
          loading={s.loading}
        >
          {s.value ? <EyeOff /> : <Eye />} {s.value ? "הסתרה" : "חשיפת מספר"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => s.copy((v) => v.split("|")[0]!.replace(/\s/g, ""))}
          aria-label="העתקת מספר כרטיס"
        >
          {s.copied ? <Check className="text-emerald-400" /> : <Copy />} העתקה
        </Button>
        <div className="ms-auto flex">
          <FavoriteButton item={card} />
          <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="עריכה">
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            aria-label="מחיקה"
            className="hover:text-rose-300"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CardForm({ item, onClose }: { item: CardItem | null; onClose: () => void }) {
  const toast = useToast();
  const [c, setC] = useState<CardItem>(
    item ?? {
      id: vault.newId("k"),
      kind: "card",
      title: "",
      holder: "",
      issuer: "",
      brand: "visa",
      last4: "",
      gradient: "violet",
      tags: [],
      favorite: false,
      attachmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const numberOk = number ? luhn(number) : Boolean(item);
  const expiryOk = expiry ? /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry) : Boolean(item);
  const valid = c.title.trim() && numberOk && expiryOk;

  return (
    <>
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-3.5 text-xs leading-relaxed text-sky-100/90">
        <Info className="mt-0.5 size-4 shrink-0 text-sky-300" />
        המספר המלא ותוקף הכרטיס מוצפנים ב־AES-256-GCM ונחשפים רק בפעולה מפורשת שנרשמת ביומן. קוד CVV
        אינו נשמר.
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="כינוי הכרטיס" htmlFor="cd-title">
          <Input
            id="cd-title"
            value={c.title}
            onChange={(e) => setC({ ...c, title: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="בעל הכרטיס" htmlFor="cd-holder">
          <Input
            id="cd-holder"
            value={c.holder}
            onChange={(e) => setC({ ...c, holder: e.target.value.toUpperCase() })}
            className="ltr text-left"
          />
        </Field>
        <Field label="מנפיק / בנק" htmlFor="cd-issuer">
          <Input
            id="cd-issuer"
            value={c.issuer}
            onChange={(e) => setC({ ...c, issuer: e.target.value })}
          />
        </Field>
        <Field label="מותג" htmlFor="cd-brand">
          <Select
            id="cd-brand"
            value={c.brand}
            onChange={(e) => setC({ ...c, brand: e.target.value as CardBrand })}
          >
            {Object.entries(BRAND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="מספר כרטיס מלא"
          htmlFor="cd-num"
          className="sm:col-span-2"
          error={number && !numberOk ? "מספר הכרטיס אינו תקין" : undefined}
          hint={item ? `ריק = ללא שינוי (•••• ${item.last4})` : undefined}
        >
          <Input
            id="cd-num"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, ""))}
            className="ltr text-left font-mono tracking-wider"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0000 0000 0000 0000"
          />
        </Field>
        <Field
          label="תוקף"
          htmlFor="cd-exp"
          error={expiry && !expiryOk ? "פורמט MM/YY" : undefined}
        >
          <Input
            id="cd-exp"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="ltr text-left font-mono"
            placeholder="MM/YY"
            autoComplete="off"
          />
        </Field>
        <Field label="עיצוב" htmlFor="cd-grad">
          <div className="flex h-11 items-center gap-2">
            {(Object.keys(GRADIENTS) as CardItem["gradient"][]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setC({ ...c, gradient: g })}
                aria-label={g}
                aria-pressed={c.gradient === g}
                className={cn(
                  "size-8 cursor-pointer rounded-lg bg-gradient-to-br ring-2 transition",
                  GRADIENTS[g],
                  c.gradient === g ? "ring-brand-400" : "ring-transparent",
                )}
              />
            ))}
          </div>
        </Field>
        <Field label="קטגוריה" htmlFor="cd-cat">
          <CategorySelect
            id="cd-cat"
            value={c.categoryId}
            onChange={(v) => setC({ ...c, categoryId: v })}
          />
        </Field>
        <Field label="תגיות" className="sm:col-span-2">
          <TagInput value={c.tags} onChange={(tags) => setC({ ...c, tags })} />
        </Field>
        <Field label="הערות" htmlFor="cd-notes" className="sm:col-span-2">
          <Textarea
            id="cd-notes"
            value={c.notes ?? ""}
            onChange={(e) => setC({ ...c, notes: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          variant="primary"
          disabled={!valid}
          onClick={async () => {
            try {
              const next = { ...c };
              if (number) {
                const digits = number.replace(/\D/g, "");
                next.last4 = digits.slice(-4);
                await api.storeSecret(
                  next.id,
                  `${digits.replace(/(.{4})/g, "$1 ").trim()}|${expiry}`,
                );
              }
              await vault.save(next);
              setNumber("");
              toast(item ? "הכרטיס עודכן" : "הכרטיס נשמר");
              onClose();
            } catch (e) {
              toast(e instanceof ApiError ? e.userMessage : "השמירה נכשלה", "error");
            }
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

function CardsView() {
  const items = useVault((s) => s.cards);
  const page = useSectionPage<CardItem>();
  const toast = useToast();
  const list = applyToolbar(items, page.toolbar, (c) => [c.issuer, c.holder, c.last4]);
  const edit = page.editing === "new" ? null : page.editing;

  return (
    <>
      <PageHeader
        title="כרטיסים"
        subtitle="מספרי כרטיס מוצפנים · נחשפים רק בפעולה מפורשת"
        tone="rose"
        icon={<CreditCard />}
        actions={
          <Button variant="primary" onClick={() => page.setEditing("new")}>
            <Plus /> כרטיס חדש
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={
            <IconTile tone="rose" size="xl">
              <CreditCard />
            </IconTile>
          }
          title="אין עדיין כרטיסים"
          description="שמור כרטיסי אשראי בצורה מוצפנת. ברירת המחדל מציגה רק 4 ספרות אחרונות."
          action={
            <Button variant="primary" size="lg" onClick={() => page.setEditing("new")}>
              <Plus /> הוסף כרטיס ראשון
            </Button>
          }
        />
      ) : (
        <>
          <SectionToolbar
            state={page.toolbar}
            onChange={page.setToolbar}
            placeholder="חיפוש לפי כינוי, מנפיק, 4 ספרות..."
          />
          <div className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-3">
            {list.map((c) => (
              <PaymentCard
                key={c.id}
                card={c}
                onEdit={() => page.setEditing(c)}
                onDelete={() => page.setDeleting(c)}
              />
            ))}
          </div>
          <div className="mt-8 flex items-start gap-3 rounded-3xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-sm text-amber-100/90">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
            <p>
              קוד CVV אינו נתמך כברירת מחדל. שמירתו מגדילה את הנזק במקרה של דליפה ואסורה לפי תקן
              PCI-DSS לעסקים. אם תופעל התמיכה בעתיד, היא תדרוש הגדרת שרת מפורשת ותוצג עם אזהרה.
            </p>
          </div>
        </>
      )}
      <Dialog
        open={page.editing !== null}
        onOpenChange={(v) => !v && page.closeEditor()}
        title={edit ? `עריכת ${edit.title}` : "כרטיס חדש"}
        size="lg"
        icon={
          <IconTile tone="rose" size="sm">
            <CreditCard />
          </IconTile>
        }
      >
        {page.editing !== null ? (
          <CardForm key={edit?.id ?? "new"} item={edit} onClose={page.closeEditor} />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={page.deleting !== null}
        onOpenChange={(v) => !v && page.setDeleting(null)}
        title="העברה לסל המחזור"
        description={`הכרטיס “${page.deleting?.title ?? ""}” יועבר לסל המחזור למשך 30 יום.`}
        confirmLabel="מחיקה"
        onConfirm={() => {
          if (page.deleting) vault.remove(page.deleting);
          toast("הועבר לסל המחזור");
        }}
      />
    </>
  );
}

export default function CardsPage() {
  return (
    <Suspense>
      <CardsView />
    </Suspense>
  );
}
