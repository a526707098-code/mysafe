"use client";
import { Suspense, useState } from "react";
import {
  Cctv,
  Cpu,
  ExternalLink,
  HardDrive,
  Network,
  Plus,
  Printer,
  Router,
  Server,
  Wifi,
  BatteryCharging,
  Box,
  type LucideIcon,
} from "lucide-react";
import { useVault, vault } from "@/lib/vault-store";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DEVICE_TYPES, type DeviceType, type NetworkItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IconTile } from "@/components/vault/icon-tile";
import { SecretField } from "@/components/vault/secret";
import { CopyText } from "@/components/vault/copy-text";
import {
  applyToolbar,
  CategorySelect,
  PageHeader,
  RowActions,
  SectionToolbar,
  TagChips,
  TagInput,
} from "@/components/vault/bits";
import { useSectionPage } from "@/components/vault/hooks";

const DEVICE_ICON: Record<DeviceType, LucideIcon> = {
  Router: Router,
  Switch: Network,
  NAS: HardDrive,
  Server: Server,
  VM: Cpu,
  "Access Point": Wifi,
  Printer: Printer,
  Camera: Cctv,
  UPS: BatteryCharging,
  Other: Box,
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;
const MAC = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;

function DeviceIcon({ type }: { type: DeviceType }) {
  const Icon = DEVICE_ICON[type];
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/25 to-sky-600/20 text-cyan-200 ring-1 ring-cyan-400/20">
      <Icon className="size-5" />
    </span>
  );
}

function Status({ online }: { online?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        online ? "text-emerald-300" : "text-slate-500",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          online ? "bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153)]" : "bg-slate-600",
        )}
      />
      {online ? "מקוון" : "לא ידוע"}
    </span>
  );
}

function NetworkForm({ item, onClose }: { item: NetworkItem | null; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<NetworkItem>(
    item ?? {
      id: vault.newId("n"),
      kind: "network",
      title: "",
      deviceType: "Router",
      ip: "",
      tags: [],
      favorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );
  const [password, setPassword] = useState("");
  const ipOk = IPV4.test(d.ip) || (d.ip.includes(":") && IPV6.test(d.ip));
  const macOk = !d.mac || MAC.test(d.mac);
  const portOk = d.port === undefined || (d.port > 0 && d.port < 65536);
  const valid = d.title.trim() && ipOk && macOk && portOk;
  const f = (k: keyof NetworkItem) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: e.target.value || undefined });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם המכשיר" htmlFor="nw-name">
          <Input
            id="nw-name"
            value={d.title}
            onChange={(e) => setD({ ...d, title: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="סוג" htmlFor="nw-type">
          <Select
            id="nw-type"
            value={d.deviceType}
            onChange={(e) => setD({ ...d, deviceType: e.target.value as DeviceType })}
          >
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="כתובת IP"
          htmlFor="nw-ip"
          error={d.ip && !ipOk ? "כתובת IP לא תקינה" : undefined}
        >
          <Input
            id="nw-ip"
            value={d.ip}
            onChange={(e) => setD({ ...d, ip: e.target.value.trim() })}
            className="ltr text-left font-mono"
            placeholder="192.168.1.1"
            inputMode="decimal"
          />
        </Field>
        <Field label="Hostname" htmlFor="nw-host">
          <Input
            id="nw-host"
            value={d.hostname ?? ""}
            onChange={f("hostname")}
            className="ltr text-left font-mono"
          />
        </Field>
        <Field label="כתובת ניהול" htmlFor="nw-url">
          <Input
            id="nw-url"
            value={d.managementUrl ?? ""}
            onChange={f("managementUrl")}
            className="ltr text-left"
            placeholder="https://"
          />
        </Field>
        <Field label="פורט" htmlFor="nw-port" error={portOk ? undefined : "1–65535"}>
          <Input
            id="nw-port"
            type="number"
            value={d.port ?? ""}
            onChange={(e) =>
              setD({ ...d, port: e.target.value ? Number(e.target.value) : undefined })
            }
            className="ltr text-left font-mono"
          />
        </Field>
        <Field label="שם משתמש" htmlFor="nw-user">
          <Input
            id="nw-user"
            value={d.username ?? ""}
            onChange={f("username")}
            className="ltr text-left"
            autoComplete="off"
          />
        </Field>
        <Field
          label="סיסמה"
          htmlFor="nw-pass"
          hint={item ? "ריק = ללא שינוי" : "מוצפנת לפני שמירה"}
        >
          <Input
            id="nw-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ltr text-left font-mono"
            autoComplete="new-password"
          />
        </Field>
        <Field label="מיקום" htmlFor="nw-loc">
          <Input id="nw-loc" value={d.location ?? ""} onChange={f("location")} />
        </Field>
        <Field label="MAC" htmlFor="nw-mac" error={macOk ? undefined : "פורמט AA:BB:CC:DD:EE:FF"}>
          <Input
            id="nw-mac"
            value={d.mac ?? ""}
            onChange={f("mac")}
            className="ltr text-left font-mono uppercase"
          />
        </Field>
        <Field label="VLAN" htmlFor="nw-vlan">
          <Input
            id="nw-vlan"
            value={d.vlan ?? ""}
            onChange={f("vlan")}
            className="ltr text-left font-mono"
          />
        </Field>
        <Field label="קטגוריה" htmlFor="nw-cat">
          <CategorySelect
            id="nw-cat"
            value={d.categoryId}
            onChange={(v) => setD({ ...d, categoryId: v })}
          />
        </Field>
        <Field label="תגיות" className="sm:col-span-2">
          <TagInput value={d.tags} onChange={(tags) => setD({ ...d, tags })} />
        </Field>
        <Field label="הערות" htmlFor="nw-notes" className="sm:col-span-2">
          <Textarea
            id="nw-notes"
            value={d.notes ?? ""}
            onChange={(e) => setD({ ...d, notes: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          variant="primary"
          disabled={!valid}
          onClick={async () => {
            try {
              if (password) await api.storeSecret(d.id, password);
              await vault.save(d);
              toast(item ? "המכשיר עודכן" : "המכשיר נוסף");
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

function NetworkView() {
  const items = useVault((s) => s.network);
  const page = useSectionPage<NetworkItem>();
  const toast = useToast();
  const [type, setType] = useState<DeviceType | "">("");
  const list = applyToolbar(items, page.toolbar, (n) => [
    n.ip,
    n.hostname,
    n.deviceType,
    n.mac,
    n.location,
    n.username,
    n.notes,
  ]).filter((n) => !type || n.deviceType === type);
  const edit = page.editing === "new" ? null : page.editing;
  const types = DEVICE_TYPES.filter((t) => items.some((i) => i.deviceType === t));

  return (
    <>
      <PageHeader
        title="רשת ושרתים"
        subtitle={`${items.length} מכשירים · מלאי תשתית מקומית`}
        tone="cyan"
        icon={<Network />}
        actions={
          <Button variant="primary" onClick={() => page.setEditing("new")}>
            <Plus /> מכשיר חדש
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={
            <IconTile tone="cyan" size="xl">
              <Router />
            </IconTile>
          }
          title="אין עדיין ציוד רשת"
          description="תעד נתבים, מתגים, NAS, שרתים ומצלמות — עם כתובות IP ופרטי ניהול מוצפנים."
          action={
            <Button variant="primary" size="lg" onClick={() => page.setEditing("new")}>
              <Plus /> הוסף מכשיר ראשון
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setType("")}
              className={cn(
                "shrink-0 cursor-pointer rounded-xl border px-3 py-1.5 text-sm transition",
                !type
                  ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                  : "border-white/10 text-slate-400 hover:text-white",
              )}
            >
              הכל <span className="text-xs opacity-60">{items.length}</span>
            </button>
            {types.map((t) => {
              const Icon = DEVICE_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "ltr flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition",
                    type === t
                      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 text-slate-400 hover:text-white",
                  )}
                >
                  <Icon className="size-3.5" /> {t}{" "}
                  <span className="text-xs opacity-60">
                    {items.filter((i) => i.deviceType === t).length}
                  </span>
                </button>
              );
            })}
          </div>
          <SectionToolbar
            state={page.toolbar}
            onChange={page.setToolbar}
            placeholder="חיפוש לפי שם, IP, hostname, MAC..."
          />

          {list.length === 0 ? (
            <p className="glass rounded-3xl py-14 text-center text-sm text-slate-500">
              אין תוצאות לסינון הנוכחי
            </p>
          ) : (
            <>
              <div className="glass hidden overflow-hidden rounded-3xl xl:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-right text-xs text-slate-500">
                      <th className="px-5 py-3.5 font-medium">מכשיר</th>
                      <th className="px-3 py-3.5 font-medium">IP</th>
                      <th className="px-3 py-3.5 font-medium">פורט / VLAN</th>
                      <th className="px-3 py-3.5 font-medium">משתמש</th>
                      <th className="w-56 px-3 py-3.5 font-medium">סיסמה</th>
                      <th className="px-3 py-3.5 font-medium">מיקום</th>
                      <th className="px-3 py-3.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((n) => (
                      <tr
                        key={n.id}
                        className="border-b border-white/[0.04] transition last:border-0 hover:bg-white/[0.025]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <DeviceIcon type={n.deviceType} />
                            <div className="min-w-0">
                              <div className="font-medium text-white">{n.title}</div>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="ltr">{n.deviceType}</span>
                                <Status online={n.online} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <CopyText value={n.ip} mono className="text-cyan-200" />
                          {n.hostname ? (
                            <div className="ltr ps-1.5 text-end font-mono text-[11px] text-slate-500">
                              {n.hostname}
                            </div>
                          ) : null}
                        </td>
                        <td className="ltr px-3 py-3 text-end font-mono text-xs text-slate-400">
                          {n.port ?? "—"} / {n.vlan ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          {n.username ? <CopyText value={n.username} /> : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {n.username ? (
                            <SecretField kind="network" id={n.id} label={n.title} compact />
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-400">{n.location ?? "—"}</td>
                        <td className="px-3 py-3">
                          <RowActions
                            item={n}
                            onEdit={() => page.setEditing(n)}
                            onDelete={() => page.setDeleting(n)}
                          >
                            {n.managementUrl ? (
                              <a
                                href={n.managementUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="grid size-8 place-items-center rounded-lg text-slate-300 hover:bg-white/[0.06] hover:text-cyan-200"
                                title="פתיחת ממשק ניהול"
                                aria-label="פתיחת ממשק ניהול"
                              >
                                <ExternalLink className="size-4" />
                              </a>
                            ) : null}
                          </RowActions>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:hidden">
                {list.map((n) => (
                  <article key={n.id} className="glass rounded-3xl p-4">
                    <div className="flex items-start gap-3">
                      <DeviceIcon type={n.deviceType} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-white">{n.title}</div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="ltr">{n.deviceType}</span>
                          {n.location ? <span>· {n.location}</span> : null}
                        </div>
                      </div>
                      <Status online={n.online} />
                    </div>
                    <dl className="bg-ink-900/50 mt-3 grid grid-cols-2 gap-2 rounded-2xl p-3 text-xs">
                      <div>
                        <dt className="text-slate-500">IP</dt>
                        <dd>
                          <CopyText value={n.ip} mono className="-ms-1.5 text-cyan-200" />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Hostname</dt>
                        <dd className="ltr truncate text-end font-mono text-slate-300">
                          {n.hostname ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">פורט</dt>
                        <dd className="ltr text-end font-mono text-slate-300">{n.port ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">VLAN</dt>
                        <dd className="ltr text-end font-mono text-slate-300">{n.vlan ?? "—"}</dd>
                      </div>
                    </dl>
                    {n.username ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-between text-sm text-slate-300">
                          <span className="text-xs text-slate-500">משתמש</span>
                          <CopyText value={n.username} />
                        </div>
                        <SecretField kind="network" id={n.id} label={n.title} />
                      </div>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between">
                      <TagChips tags={n.tags} />
                      <RowActions
                        item={n}
                        onEdit={() => page.setEditing(n)}
                        onDelete={() => page.setDeleting(n)}
                      >
                        {n.managementUrl ? (
                          <a
                            href={n.managementUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid size-8 place-items-center rounded-lg text-slate-300 hover:bg-white/[0.06]"
                            aria-label="פתיחת ממשק ניהול"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                      </RowActions>
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
        title={edit ? `עריכת ${edit.title}` : "מכשיר חדש"}
        size="lg"
        icon={
          <IconTile tone="cyan" size="sm">
            <Router />
          </IconTile>
        }
      >
        {page.editing !== null ? (
          <NetworkForm key={edit?.id ?? "new"} item={edit} onClose={page.closeEditor} />
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

export default function NetworkPage() {
  return (
    <Suspense>
      <NetworkView />
    </Suspense>
  );
}
