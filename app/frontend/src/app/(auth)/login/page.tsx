"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, TimerOff, User } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Logo } from "@/components/vault/logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { passwordAccepted } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reason = params.get("reason");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.login(username, password);
      // Never keep the password in memory longer than the request.
      setPassword("");
      passwordAccepted(username.trim());
      router.push("/login/verify");
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : "שגיאה בהתחברות");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Logo className="mb-10 lg:hidden" />
      {reason ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-200">
          {reason === "idle" ? (
            <TimerOff className="size-5 shrink-0" />
          ) : (
            <Lock className="size-5 shrink-0" />
          )}
          {reason === "idle"
            ? "הכספת ננעלה אוטומטית עקב חוסר פעילות."
            : "הכספת ננעלה. כל המידע המפוענח נמחק מהזיכרון."}
        </div>
      ) : null}
      <h1 className="text-3xl font-bold text-white">כניסה לכספת</h1>
      <p className="mt-2 text-sm text-slate-400">שלב 1 מתוך 2 · שם משתמש וסיסמה ראשית</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="שם משתמש" htmlFor="username">
          <div className="relative">
            <User className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="ps-10"
              required
            />
          </div>
        </Field>
        <Field label="סיסמה ראשית" htmlFor="password">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              id="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="ltr ps-10 pe-11 text-right"
              required
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute top-1/2 left-2 -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-slate-500 hover:text-white"
              aria-label={show ? "הסתרת סיסמה" : "הצגת סיסמה"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          המשך לאימות דו־שלבי <ArrowLeft />
        </Button>
      </form>

      <div className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-500">
        <strong className="text-slate-300">אב־טיפוס:</strong> כל שם משתמש וסיסמה יתקבלו, וכל קוד בן
        6 ספרות בשלב הבא. כל הנתונים בממשק הם נתוני דוגמה.{" "}
        <Link href="/setup" className="text-brand-300 underline-offset-4 hover:underline">
          צפייה במסך ההגדרה הראשונית
        </Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
