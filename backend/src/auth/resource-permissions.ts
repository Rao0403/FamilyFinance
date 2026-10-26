import { readAll } from "../lib/database";
import type { Env } from "../types/environment";
import type { Member } from "../types/records";

export async function owns(env: Env, member: Member, table: string, id: string) {
  if (!["accounts", "investments", "payments", "documents"].includes(table)) return false;
  return !!(await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND owner_id=?`)
    .bind(id, member.id)
    .first());
}

export async function canView(
  env: Env,
  member: Member,
  type: string,
  id: string,
): Promise<boolean> {
  const table = {
    account: "accounts",
    investment: "investments",
    payment: "payments",
    document: "documents",
  }[type];
  if (!table) return false;
  if (await owns(env, member, table, id)) return true;
  if (
    await env.DB.prepare(
      "SELECT id FROM shares WHERE recipient_id=? AND resource_type=? AND resource_id=?",
    )
      .bind(member.id, type, id)
      .first()
  )
    return true;
  if (type === "document") {
    const rows = await readAll<{ type: string; target_id: string | null }>(
      env.DB.prepare(
        "SELECT type,target_id FROM imports WHERE document_id=? AND target_id IS NOT NULL",
      ).bind(id),
    );
    for (const row of rows)
      if (
        row.target_id &&
        (await canView(
          env,
          member,
          row.type === "account" ? "account" : "investment",
          row.target_id,
        ))
      )
        return true;
  }
  return false;
}

export async function canEdit(
  env: Env,
  member: Member,
  type: string,
  id: string,
): Promise<boolean> {
  const table = {
    account: "accounts",
    investment: "investments",
    payment: "payments",
    document: "documents",
  }[type];
  if (!table) return false;
  if (await owns(env, member, table, id)) return true;
  return !!(await env.DB.prepare(
    "SELECT id FROM shares WHERE recipient_id=? AND resource_type=? AND resource_id=? AND permission='edit'",
  )
    .bind(member.id, type, id)
    .first());
}

export async function visible<T extends { id: string }>(
  env: Env,
  member: Member,
  table: string,
  type: string,
): Promise<T[]> {
  const rows = await readAll<T>(env.DB.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`));
  const results: T[] = [];
  for (const row of rows)
    if (await canView(env, member, type, row.id))
      results.push({ ...row, can_edit: await canEdit(env, member, type, row.id) });
  return results;
}
