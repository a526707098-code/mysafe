"use client";

/** Non-sensitive UI preferences. Persisted in localStorage; never holds vault data. */
import { useSyncExternalStore } from "react";

export interface Prefs {
  autoHideSecrets: boolean;
  revealSeconds: number;
  clearClipboard: boolean;
}

const DEFAULTS: Prefs = { autoHideSecrets: true, revealSeconds: 10, clearClipboard: true };
const KEY = "pv-prefs";
let cache: Prefs | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

export function setPrefs(next: Partial<Prefs>) {
  cache = { ...read(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    read,
    () => DEFAULTS,
  );
}
