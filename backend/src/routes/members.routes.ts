import { readAll } from "../lib/database";
import { body, fail, json } from "../lib/http";
import { uid } from "../lib/identifiers";
import { asText } from "../lib/validation";
import { audit } from "../services/audit-log";
import type { RouteContext } from "../types/route-context";

export async function handleMembersRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, path, method, key } = context;
  if (key === "members") {
    if (method === "GET")
      return json(
        await readAll(
          env.DB.prepare(
            "SELECT id,name,email,role,active FROM members WHERE active=1 ORDER BY created_at",
          ),
        ),
      );
    if (method === "POST" && member.role === "admin") {
      const data = await body(request),
        email = asText(data.email, 254).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "Valid email required");
      const count = await env.DB.prepare(
        "SELECT count(*) AS total FROM members WHERE active=1",
      ).first<{ total: number }>();
      if ((count?.total ?? 0) >= 4)
        return fail(400, "This family workspace is limited to four active members");
      const prior = await env.DB.prepare("SELECT id,active FROM members WHERE email=?")
        .bind(email)
        .first<{ id: string; active: number }>();
      if (prior?.active) return fail(409, "Member is already active");
      if (prior) {
        await env.DB.prepare("UPDATE members SET active=1,name=? WHERE id=?")
          .bind(asText(data.name) || email.split("@")[0], prior.id)
          .run();
        await audit(env, member, "reactivate", "member", prior.id);
        return json({ id: prior.id });
      }
      const id = uid();
      await env.DB.prepare("INSERT INTO members (id,email,name) VALUES (?,?,?)")
        .bind(id, email, asText(data.name) || email.split("@")[0])
        .run();
      await audit(env, member, "invite", "member", id);
      return json({ id }, 201);
    }
    if (method === "PATCH" && path[1] && member.role === "admin") {
      if (path[1] === member.id)
        return fail(400, "Administrator cannot deactivate their own login");
      const target = await env.DB.prepare("SELECT id,active FROM members WHERE id=?")
        .bind(path[1])
        .first<{ id: string; active: number }>();
      if (!target) return fail(404, "Member not found");
      const data = await body(request);
      if (data.active !== false) return fail(400, "Only deactivation is supported here");
      await env.DB.prepare("UPDATE members SET active=0 WHERE id=?").bind(path[1]).run();
      await audit(env, member, "deactivate", "member", path[1]);
      return json({ ok: true });
    }
  }
  return null;
}
