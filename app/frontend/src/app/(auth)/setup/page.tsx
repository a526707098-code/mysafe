"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Download, KeyRound, QrCode, ShieldCheck, UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { estimateEntropy } from "@/lib/password-generator";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { OtpInput } from "@/components/vault/otp-input";
import { StrengthMeter } from "@/components/vault/password-generator";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const randomFrom = (alphabet: string, n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join(
    "",
  );

/**
 * First-launch flow. In production the TOTP secret is generated server-side,
 * stored encrypted with TOTP_ENCRYPTION_KEY, and only activated after the
 * first code verifies. Recovery codes are shown once and stored as Argon2id
 * hashes. Here everything is generated locally for the demo and discarded.
 */
export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [otp, setOtp] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- client-only random generation */
    setSecret(randomFrom(B32, 32));
    setCodes(
      Array.from(
        { length: 10 },
        () =>
          `${randomFrom("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 4)}-${randomFrom("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 4)}`,
      ),
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const bits = estimateEntropy(password);
  const pwErrors = useMemo(() => {
    const e: string[] = [];
    if (password.length < 14) e.push("לפחות 14 תווים");
    if (bits < 70) e.push("מורכבות גבוהה יותר (אותיות, ספרות וסימנים)");
    if (confirm && confirm !== password) e.push("האימות אינו תואם");
    return e;
  }, [password, confirm, bits]);
  const accountOk =
    /^[a-z0-9._-]{3,32}$/i.test(username) && pwErrors.length === 0 && confirm === password;

  const otpauth = `otpauth://totp/PRIVATE%20VAULT:${encodeURIComponent(username || "owner")}?secret=${secret}&issuer=PRIVATE%20VAULT&algorithm=SHA1&digits=6&period=30`;

  const steps = [
    { label: "חשבון ראשי", icon: <UserPlus /> },
    { label: "אפליקציית אימות", icon: <QrCode /> },
    { label: "קודי שחזור", icon: <KeyRound /> },
  ];

  return (
    <>
      <ol className="mb-10 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold transition [&_svg]:size-4",
                i < step && "bg-emerald-500/20 text-emerald-300",
                i === step && "from-brand-500 to-accent-500 text-ink-950 bg-gradient-to-br",
                i > step && "bg-white/[0.05] text-slate-500",
              )}
            >
              {i < step ? <Check /> : s.icon}
            </span>
            <span
              className={cn(
                "hidden text-xs sm:block",
                i === step ? "text-white" : "text-slate-500",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 ? <span className="h-px flex-1 bg-white/10" /> : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (accountOk) {
              setPassword("");
              setConfirm("");
              setStep(1);
            }
          }}
        >
          <h1 className="text-3xl font-bold text-white">הגדרה ראשונית</h1>
          <p className="text-sm text-slate-400">
            יצירת חשבון המנהל היחיד של הכספת. הסיסמה נשמרת כ־Argon2id hash בלבד.
          </p>
          <Field label="שם משתמש" htmlFor="su-user" hint="אותיות לועזיות, ספרות, נקודה, מקף">
            <Input
              id="su-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="ltr text-right"
            />
          </Field>
          <Field label="סיסמה ראשית" htmlFor="su-pass">
            <Input
              id="su-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="ltr text-right"
            />
          </Field>
          <StrengthMeter password={password} />
          <Field label="אימות סיסמה" htmlFor="su-confirm">
            <Input
              id="su-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="ltr text-right"
            />
          </Field>
          {password ? (
            <ul className="space-y-1 text-xs">
              {pwErrors.map((e) => (
                <li key={e} className="text-amber-300">
                  • {e}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5 text-xs leading-relaxed text-amber-200/90">
            אין שחזור סיסמה בדוא״ל. אם הסיסמה וקודי השחזור יאבדו, הגישה לכספת תדרוש שחזור מגיבוי עם
            גישה לשרת.
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!accountOk}
          >
            המשך
          </Button>
        </form>
      ) : null}

      {step === 1 ? (
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-white">חיבור אפליקציית אימות</h1>
          <p className="text-sm text-slate-400">
            סרוק את הקוד באפליקציה: Google Authenticator, Microsoft Authenticator, 2FAS או Authy.
          </p>
          <div className="glass flex flex-col items-center gap-5 rounded-3xl p-6 sm:flex-row">
            <div className="rounded-2xl bg-white p-3 shadow-[0_0_40px_-10px_rgb(34_211_238/0.6)]">
              {secret ? (
                <QRCodeSVG value={otpauth} size={152} level="M" />
              ) : (
                <div className="size-38" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-center sm:text-start">
              <div className="text-xs text-slate-400">או הזן ידנית:</div>
              <div className="ltr bg-ink-900/80 text-brand-200 rounded-xl p-3 font-mono text-[13px] break-all">
                {secret.match(/.{1,4}/g)?.join(" ")}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="text-emerald-400" /> : <Copy />} העתקת מפתח
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-center text-sm text-slate-300">הזן את הקוד הראשון לאימות ההגדרה</p>
            <OtpInput value={otp} onChange={setOtp} />
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={otp.length !== 6}
            onClick={() => setStep(2)}
          >
            אימות והפעלת 2FA
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-white">קודי שחזור</h1>
          <p className="text-sm text-slate-400">
            שמור את הקודים במקום בטוח מחוץ לכספת. כל קוד תקף פעם אחת. הקודים יוצגו{" "}
            <strong className="text-white">רק עכשיו</strong>.
          </p>
          <div className="glass grid grid-cols-2 gap-2 rounded-3xl p-5">
            {codes.map((c) => (
              <code
                key={c}
                className="ltr bg-ink-900/70 rounded-lg py-2 text-center font-mono text-sm text-slate-200"
              >
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                const blob = new Blob([`PRIVATE VAULT recovery codes\n\n${codes.join("\n")}\n`], {
                  type: "text/plain",
                });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "private-vault-recovery-codes.txt";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              <Download /> הורדה
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => navigator.clipboard.writeText(codes.join("\n"))}
            >
              <Copy /> העתקה
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="size-4 accent-cyan-400"
            />
            שמרתי את הקודים במקום בטוח
          </label>
          <Link
            href="/login"
            aria-disabled={!saved}
            className={cn(!saved && "pointer-events-none")}
          >
            <Button variant="primary" size="lg" className="w-full" disabled={!saved}>
              <ShieldCheck /> סיום וכניסה לכספת
            </Button>
          </Link>
        </div>
      ) : null}

      <div className="mt-8 text-center">
        <Link href="/login" className="text-xs text-slate-500 hover:text-slate-300">
          אב־טיפוס · חזרה למסך הכניסה
        </Link>
      </div>
    </>
  );
}
