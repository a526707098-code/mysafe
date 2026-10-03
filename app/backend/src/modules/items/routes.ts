import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { EncryptionService } from "../../crypto/encryption.js";
import { audit, type AuditEvent } from "../auth/audit.js";
import { cur } from "../auth/routes.js";
import {
  categoryBody,
  createSchemas,
  ITEM_KINDS,
  revealBody,
  updateSchemas,
  uuid,
  type ItemKind,
} from "./schemas.js";
import * as svc from "./service.js";

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export interface ItemsDeps {
  env: Env;
  pool: Pool;
  enc: EncryptionService;
  requireActive: Guard;
}

const bad = (reply: FastifyReply, issues?: z.ZodError) =>
  reply.status(422).send({
    error: "פרטים לא תקינים",
    // Field names only, never the submitted values (they may be secrets).
    fields: issues
      ? [...new Set(issues.issues.map((i) => i.path.join(".") || "(root)"))]
      : undefined,
  });

export function registerItemRoutes(app: FastifyInstance, deps: ItemsDeps) {
  const { pool, requireActive } = deps;
  const d: svc.Deps = { pool, enc: deps.enc, allowCvv: deps.env.ALLOW_CVV_STORAGE };
  const guard = { preHandler: requireActive };

  const actorFor = (req: FastifyRequest): svc.Actor => ({
    label: (event, id, title) => record(req, event, id, title),
  });
  const record = (req: FastifyRequest, event: AuditEvent, itemId: string, title: string) => {
    const s = cur(req);
    return audit(pool, {
      event,
      itemId,
      label: title.slice(0, 200),
      ip: req.ip,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      userId: s.user_id,
      sessionId: s.id,
    });
  };

  const idParam = (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (uuid.safeParse(req.params.id).success) return req.params.id;
    void reply.status(404).send({ error: "לא נמצא" });
    return null;
  };

  // ------------------------------------------------------------ items

  const listQuery = z.object({
    kind: z.enum(ITEM_KINDS as [ItemKind, ...ItemKind[]]).optional(),
    favorite: z.enum(["true", "false"]).optional(),
    category: uuid.optional(),
    tag: z.string().max(40).optional(),
    q: z.string().max(200).optional(),
  });

  app.get("/api/items", guard, async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return bad(reply, q.error);
    return {
      items: await svc.listItems(d, {
        kind: q.data.kind,
        favorite: q.data.favorite === "true",
        categoryId: q.data.category,
        tag: q.data.tag,
        q: q.data.q,
      }),
    };
  });

  // Global search is the same query without the kind restriction; the query string is
  // stripped from request logs (see app.ts), so it never lands in a log file.
  app.get("/api/search", guard, async (req, reply) => {
    const q = z.object({ q: z.string().trim().min(1).max(200) }).safeParse(req.query);
    if (!q.success) return bad(reply, q.error);
    return { items: await svc.listItems(d, { q: q.data.q, limit: 100 }) };
  });

  app.get<{ Params: { id: string } }>("/api/items/:id", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    return svc.getItem(d, id);
  });

  app.post<{ Params: { kind: string } }>("/api/items/:kind", guard, async (req, reply) => {
    const kind = req.params.kind as ItemKind;
    if (!ITEM_KINDS.includes(kind)) return reply.status(404).send({ error: "לא נמצא" });
    const body = createSchemas[kind].safeParse(req.body);
    if (!body.success) return bad(reply, body.error);
    const item = await svc.createItem(d, kind, body.data as never, actorFor(req));
    return reply.status(201).send(item);
  });

  app.put<{ Params: { id: string } }>("/api/items/:id", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    const kindRow = await pool.query<{ kind: ItemKind }>("SELECT kind FROM items WHERE id = $1", [
      id,
    ]);
    const kind = kindRow.rows[0]?.kind;
    if (!kind || !(kind in updateSchemas)) return reply.status(404).send({ error: "לא נמצא" });
    const body = updateSchemas[kind].safeParse(req.body);
    if (!body.success) return bad(reply, body.error);
    return svc.updateItem(d, id, body.data as never, actorFor(req), kind);
  });

  app.post<{ Params: { id: string } }>("/api/items/:id/favorite", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    const body = z.object({ favorite: z.boolean() }).strict().safeParse(req.body);
    if (!body.success) return bad(reply, body.error);
    await svc.setFavorite(d, id, body.data.favorite);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/items/:id", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    await svc.trashItem(d, id, actorFor(req));
    return { ok: true };
  });

  // ------------------------------------------------------------ secrets

  app.post<{ Params: { id: string } }>("/api/items/:id/reveal", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    const body = revealBody.safeParse(req.body);
    if (!body.success) return bad(reply, body.error);
    const r = await svc.revealSecret(d, id, body.data.field);
    // Audit first: if the audit write fails, the secret is not returned.
    const event: AuditEvent =
      r.event === "CARD"
        ? "CARD_REVEALED"
        : body.data.purpose === "copy"
          ? "PASSWORD_COPIED"
          : "PASSWORD_VIEWED";
    await record(req, event, id, r.title);
    return { value: r.value };
  });

  // ------------------------------------------------------------ trash

  app.get("/api/trash", guard, async () => {
    const retention = deps.env.TRASH_RETENTION_DAYS;
    const rows = await pool.query<{ id: string; deleted_at: Date }>(
      "SELECT id, deleted_at FROM items WHERE deleted_at IS NOT NULL",
    );
    const when = new Map(rows.rows.map((r) => [r.id, r.deleted_at]));
    const items = await svc.listItems(d, { trash: true });
    return {
      retentionDays: retention,
      items: items.map((i) => {
        const at = when.get(i.id as string) as Date;
        return {
          id: i.id,
          title: i.title,
          kind: i.kind,
          deletedAt: at.toISOString(),
          purgeAt: new Date(at.getTime() + retention * 86_400_000).toISOString(),
        };
      }),
    };
  });

  app.post<{ Params: { id: string } }>("/api/trash/:id/restore", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    return svc.restoreItem(d, id, actorFor(req));
  });

  app.delete<{ Params: { id: string } }>("/api/trash/:id", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    await svc.purgeItem(d, id, actorFor(req));
    return { ok: true };
  });

  // ------------------------------------------------------------ categories, tags, audit

  app.get("/api/categories", guard, async () => ({ categories: await svc.listCategories(d) }));
  app.get("/api/tags", guard, async () => ({ tags: await svc.listTags(d) }));

  app.post("/api/categories", guard, async (req, reply) => {
    const b = categoryBody.safeParse(req.body);
    if (!b.success) return bad(reply, b.error);
    return reply.status(201).send(await svc.createCategory(d, b.data));
  });
  app.put<{ Params: { id: string } }>("/api/categories/:id", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    const b = categoryBody.safeParse(req.body);
    if (!b.success) return bad(reply, b.error);
    return svc.updateCategory(d, id, b.data);
  });
  app.delete<{ Params: { id: string } }>("/api/categories/:id", guard, async (req, reply) => {
    const id = idParam(req, reply);
    if (!id) return;
    await svc.deleteCategory(d, id);
    return { ok: true };
  });

  app.get("/api/audit", guard, async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? 100);
    return { events: await svc.listAudit(d, Number.isFinite(limit) ? limit : 100) };
  });
}
