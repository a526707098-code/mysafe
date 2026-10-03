/**
 * Client-side pre-check for attachments. The backend repeats every check
 * (it is the only one that counts) and additionally re-encodes images and
 * encrypts the file before it touches disk. This exists for fast feedback.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const ALLOWED = {
  "image/jpeg": { ext: ["jpg", "jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  "image/png": { ext: ["png"], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/webp": { ext: ["webp"], magic: [[0x52, 0x49, 0x46, 0x46]] },
  "application/pdf": { ext: ["pdf"], magic: [[0x25, 0x50, 0x44, 0x46]] },
} as const;

export type AllowedMime = keyof typeof ALLOWED;
export const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

export async function validateUpload(
  file: File,
): Promise<{ ok: true; mime: AllowedMime } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: "הקובץ ריק" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "הקובץ גדול מ־20MB" };
  const mime = file.type as AllowedMime;
  const rule = ALLOWED[mime];
  if (!rule) return { ok: false, error: "סוג קובץ לא נתמך. מותר: JPEG, PNG, WEBP, PDF" };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(rule.ext as readonly string[]).includes(ext))
    return { ok: false, error: "סיומת הקובץ אינה תואמת לסוגו" };
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const magicOk = rule.magic.some((sig) => sig.every((b, i) => head[i] === b));
  if (!magicOk) return { ok: false, error: "תוכן הקובץ אינו תואם לסוג המוצהר" };
  return { ok: true, mime };
}
