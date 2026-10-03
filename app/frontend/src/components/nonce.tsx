"use client";
import { setNonce } from "get-nonce";

/**
 * Radix dialogs inject a <style> tag (react-remove-scroll) at runtime; under
 * our nonce-only style-src it must carry the request nonce or it is blocked.
 */
export function CspNonce({ nonce }: { nonce: string }) {
  if (typeof window !== "undefined" && nonce) setNonce(nonce);
  return null;
}
