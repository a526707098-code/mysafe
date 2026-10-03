"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LifeBuoy, ShieldCheck, Smartphone } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconTile } from "@/components/vault/icon-tile";
import { OtpInput } from "@/components/vault/otp-input";

export default function VerifyPage() {
  const router = useRouter();
  const { stage, totpAccepted, username } = useSession();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (stage === "locked") router.replace("/login");
    if (stage === "unlocked") router.replace("/");
  }, [stage, router]);

  const verify = async (value = code) => {
    setBusy(true);
    setError("");
    try {
      if (recovery) await api.verifyRecoveryCode(recoveryCode);
      else await api.verifyTotp(value);
      totpAccepted();
      router.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.userMessage : "שגיאה באימות");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <IconTile tone="emerald" size="xl" className="mb-8">
        {recovery ? <LifeBuoy /> : <Smartphone />}
      </IconTile>
      <h1 className="text-3xl font-bold text-white">{recovery ? "קוד שחזור" : "אימות דו־שלבי"}</h1>
      <p className="mt-2 text-sm text-slate-400">
        שלב 2 מתוך 2 ·{" "}
        {recovery
          ? "הזן אחד מקודי השחזור שנשמרו בהגדרה. כל קוד תקף לשימוש אחד."
          : "הזן את הקוד בן 6 הספרות מאפליקציית האימות (Google Authenticator, Microsoft Authenticator, 2FAS)."}
      </p>
      {username ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400">
          <ShieldCheck className="size-3.5 text-emerald-400" /> מתחבר כ־
          <span className="ltr text-slate-200">{username}</span>
        </p>
      ) : null}

      <form
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        {recovery ? (
          <Input
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            className="ltr h-14 text-center font-mono text-xl tracking-widest"
            autoComplete="off"
            autoFocus
            aria-label="קוד שחזור"
          />
        ) : (
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={(v) => void verify(v)}
            invalid={Boolean(error)}
          />
        )}
        {error ? (
          <p role="alert" className="text-center text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={recovery ? recoveryCode.length < 11 : code.length !== 6}
        >
          אימות וכניסה
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/login" className="flex items-center gap-1.5 text-slate-400 hover:text-white">
          <ArrowRight className="size-4" /> חזרה
        </Link>
        <button
          type="button"
          onClick={() => {
            setRecovery((v) => !v);
            setError("");
          }}
          className="text-brand-300 cursor-pointer hover:underline"
        >
          {recovery ? "שימוש באפליקציית אימות" : "אין גישה לאפליקציה? קוד שחזור"}
        </button>
      </div>
    </>
  );
}
