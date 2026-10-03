"use client";

/**
 * Prototype session state. In production the session lives in an HttpOnly
 * cookie the browser cannot read; this provider only mirrors "am I unlocked"
 * for routing and owns the idle auto-lock timer. sessionStorage holds a single
 * non-secret flag so a page refresh in the prototype does not force a re-login.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { vault } from "./vault-store";
import { api } from "./api";
import { clearClipboardNow } from "./clipboard";

type Stage = "loading" | "locked" | "awaiting-totp" | "unlocked";

interface SessionValue {
  stage: Stage;
  username: string;
  idleMinutes: number;
  setIdleMinutes: (m: number) => void;
  passwordAccepted: (username: string) => void;
  totpAccepted: () => void;
  lock: (reason?: "manual" | "idle") => void;
  /** Epoch ms when the idle timer will fire, for the countdown pill (polled, not reactive). */
  getLockAt: () => number;
}

const SessionContext = createContext<SessionValue | null>(null);
const FLAG = "pv-proto-stage";
const USER = "pv-proto-user";
const IDLE = "pv-idle-minutes";

const readStorage = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStorage = (key: string, value: string | null) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: the prototype just forgets on refresh */
  }
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [username, setUsername] = useState("");
  const [idleMinutes, setIdleState] = useState(15);
  const lockAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastBump = useRef(0);

  useEffect(() => {
    // Hydrate from sessionStorage once on mount (client only).
    const saved = readStorage(FLAG);
    const idle = Number(readStorage(IDLE));
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration of client-only storage */
    if (idle >= 1 && idle <= 240) setIdleState(idle);
    setUsername(readStorage(USER) ?? "");
    setStage(
      saved === "unlocked" ? "unlocked" : saved === "awaiting-totp" ? "awaiting-totp" : "locked",
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const lock = useCallback(
    (reason: "manual" | "idle" = "manual") => {
      if (timer.current) clearTimeout(timer.current);
      vault.clear();
      void clearClipboardNow();
      void api.logout();
      writeStorage(FLAG, null);
      setStage("locked");
      router.replace(reason === "idle" ? "/login?reason=idle" : "/login?reason=locked");
    },
    [router],
  );

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const ms = idleMinutes * 60_000;
    lockAt.current = Date.now() + ms;
    timer.current = setTimeout(() => lock("idle"), ms);
  }, [idleMinutes, lock]);

  useEffect(() => {
    if (stage !== "unlocked") return;
    arm();
    const bump = () => {
      // Throttle: re-arming on every mousemove is wasteful.
      if (Date.now() - lastBump.current < 5_000) return;
      lastBump.current = Date.now();
      arm();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stage, arm]);

  const value = useMemo<SessionValue>(
    () => ({
      stage,
      username,
      idleMinutes,
      getLockAt: () => lockAt.current,
      setIdleMinutes: (m) => {
        setIdleState(m);
        writeStorage(IDLE, String(m));
      },
      passwordAccepted: (u) => {
        setUsername(u);
        writeStorage(USER, u);
        writeStorage(FLAG, "awaiting-totp");
        setStage("awaiting-totp");
      },
      totpAccepted: () => {
        writeStorage(FLAG, "unlocked");
        setStage("unlocked");
      },
      lock,
    }),
    [stage, username, idleMinutes, lock],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
