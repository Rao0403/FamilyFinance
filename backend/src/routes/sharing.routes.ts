import { owns } from "../auth/resource-permissions";
import { readAll } from "../lib/database";
import { body, fail, json } from "../lib/http";
import { uid } from "../lib/identifiers";
import { asText } from "../lib/validation";
import { audit } from "../services/audit-log";
import type { RecordRow } from "../types/records";
import type { RouteContext } from "../types/route-context";

export async function handleSharingRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, path, method, key } = context;
  if (key === "shares") {
    if (method === "GET")
      return json(
        await readAll(
          env.DB.prepare("SELECT * FROM shares WHERE owner_id=? ORDER BY created_at DESC").bind(
            member.id,
          ),
        ),
      );
    if (method === "POST") {
      const data = await body(request),
        type = asText(data.resource_type),
        id = asText(data.resource_id),
        recipient = asText(data.recipient_id);
      const table = {
        account: "accounts",
        investment: "investments",
        payment: "payments",
        document: "documents",
      }[type];
      if (!table || !(await owns(env, member, table, id)))
        return fail(403, "Only the owner can share this record");
      if (
        recipient === member.id ||
        !(await env.DB.prepare("SELECT id FROM members WHERE id=? AND active=1")
          .bind(recipient)
          .first())
      )
        return fail(400, "Invalid recipient");
      const permission = data.permission === "edit" ? "edit" : "view";
      await env.DB.prepare(
        "INSERT INTO shares (id,owner_id,recipient_id,resource_type,resource_id,permission) VALUES (?,?,?,?,?,?) ON CONFLICT(recipient_id,resource_type,resource_id) DO UPDATE SET permission=excluded.permission",
      )
        .bind(uid(), member.id, recipient, type, id, permission)
        .run();
      await audit(env, member, "share", type, id, { recipient, permission });
      return json({ ok: true });
    }
    if (method === "DELETE" && path[1]) {
      const share = await env.DB.prepare("SELECT * FROM shares WHERE id=? AND owner_id=?")
        .bind(path[1], member.id)
        .first<RecordRow>();
      if (!share) return fail(404, "Share not found");
      await env.DB.prepare("DELETE FROM shares WHERE id=?").bind(path[1]).run();
      await audit(env, member, "revoke", String(share.resource_type), String(share.resource_id), {
        recipient: share.recipient_id,
      });
      return json({ ok: true });
    }
  }
  return null;
}
