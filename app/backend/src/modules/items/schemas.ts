import { isIP } from "node:net";
import { z } from "zod";

/** Only http(s) URLs: a stored `javascript:` link would become XSS the moment the UI renders it. */
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "must be an http(s) URL");

const optText = (max: number) => z.string().trim().max(max).optional();
const optNullable = <T extends z.ZodType>(s: T) => s.nullable().optional();

const ip = z
  .string()
  .trim()
  .refine((v) => isIP(v) !== 0, "invalid IP address");

const mac = z
  .string()
  .trim()
  .regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, "invalid MAC address")
  .transform((v) => v.replace(/-/g, ":").toLowerCase());

const uuid = z.string().uuid();

export const DEVICE_TYPES = [
  "Router",
  "Switch",
  "NAS",
  "Server",
  "VM",
  "Access Point",
  "Printer",
  "Camera",
  "UPS",
  "Other",
] as const;

const tags = z.array(z.string().trim().min(1).max(40)).max(30);

const common = {
  title: z.string().trim().min(1).max(200),
  categoryId: optNullable(uuid),
  tags: tags.optional(),
  favorite: z.boolean().optional(),
  notes: optNullable(z.string().max(20_000)),
};

const secret = z.string().min(1).max(4096);

export const passwordCreate = z
  .object({
    ...common,
    websiteName: optText(200),
    url: optNullable(httpUrl),
    username: optText(320),
    password: secret,
  })
  .strict();

export const networkCreate = z
  .object({
    ...common,
    deviceType: z.enum(DEVICE_TYPES),
    ip: optNullable(ip),
    hostname: optText(253),
    managementUrl: optNullable(httpUrl),
    port: optNullable(z.number().int().min(1).max(65535)),
    username: optText(200),
    password: secret.optional(),
    location: optText(200),
    mac: optNullable(mac),
    vlan: optText(40),
  })
  .strict();

const field = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(100),
    sensitive: z.boolean(),
    /** Omit on an existing sensitive field to keep its stored value. */
    value: z.string().max(4096).optional(),
  })
  .strict();

export const recordCreate = z
  .object({ ...common, fields: z.array(field).max(100).optional() })
  .strict();

const cardNumber = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{12,19}$/, "invalid card number"));

export const GRADIENTS = ["violet", "emerald", "slate", "rose", "amber"] as const;
export const BRANDS = ["visa", "mastercard", "amex", "isracard", "diners", "other"] as const;

export const cardCreate = z
  .object({
    ...common,
    holder: optText(200),
    issuer: optText(200),
    brand: z.enum(BRANDS).optional(),
    number: cardNumber,
    expiry: z
      .string()
      .trim()
      .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "expiry must be MM/YY")
      .optional(),
    cvv: z
      .string()
      .regex(/^\d{3,4}$/)
      .optional(),
    gradient: z.enum(GRADIENTS).optional(),
  })
  .strict();

export const createSchemas = {
  password: passwordCreate,
  network: networkCreate,
  record: recordCreate,
  card: cardCreate,
} as const;

export type ItemKind = keyof typeof createSchemas;
export const ITEM_KINDS = Object.keys(createSchemas) as ItemKind[];

/** Updates: same shape, everything optional, secrets optional (omitted = unchanged). */
export const updateSchemas = {
  password: passwordCreate.partial().strict(),
  network: networkCreate.partial().strict(),
  record: recordCreate.partial().strict(),
  card: cardCreate.partial().strict(),
} as const;

export const categoryBody = z
  .object({
    name: z.string().trim().min(1).max(60),
    icon: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,40}$/)
      .default("folder"),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    description: z.string().trim().max(300).nullable().optional(),
    section: z
      .enum(["all", "passwords", "network", "records", "cards", "documents"])
      .default("all"),
  })
  .strict();

export const revealBody = z
  .object({
    field: z.string().min(1).max(60),
    purpose: z.enum(["view", "copy"]).default("view"),
  })
  .strict();

export { uuid };
