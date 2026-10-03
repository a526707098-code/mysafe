/** How long a copied secret may live in the clipboard before we try to clear it. */
export const CLIPBOARD_CLEAR_MS = 30_000;

let pendingClear: ReturnType<typeof setTimeout> | undefined;

/**
 * Copy a secret and schedule a best-effort clear. Browsers only allow
 * clipboard writes from a focused document, so the clear can silently fail if
 * the tab is in the background; we only overwrite when the clipboard still
 * holds our value (when readText is permitted) to avoid clobbering the user.
 */
export async function copySecret(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  if (pendingClear) clearTimeout(pendingClear);
  pendingClear = setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText().catch(() => value);
      if (current === value) await navigator.clipboard.writeText("");
    } catch {
      /* clipboard not writable now (tab hidden); nothing else we can do */
    }
  }, CLIPBOARD_CLEAR_MS);
}

export async function clearClipboardNow() {
  if (pendingClear) clearTimeout(pendingClear);
  try {
    await navigator.clipboard.writeText("");
  } catch {
    /* ignore */
  }
}
