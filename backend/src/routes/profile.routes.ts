import { clearDeletedDocuments } from "../jobs/document-cleanup";
import { readAll } from "../lib/database";
import { body, fail, json } from "../lib/http";
import { uid } from "../lib/identifiers";
import { asText } from "../lib/validation";
import { audit } from "../services/audit-log";
import type { RouteContext } from "../types/route-context";

export async function handleProfileRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, path, method, key } = context;
  if (key === "me" && method === "GET") return json(member);
  if (key === "me" && method === "PATCH") {
    const data = await body(request),
      name = asText(data.name) || member.name;
    await env.DB.prepare("UPDATE members SET name=? WHERE id=?").bind(name, member.id).run();
    await audit(env, member, "profile", "member", member.id);
    return json({ ok: true });
  }
  if (key === "me" && path[1] === "data" && method === "DELETE") {
    const data = await body(request);
    if (data.confirm !== "DELETE MY DATA") return fail(400, "Type DELETE MY DATA to confirm");
    const documents = await readAll<{ storage_key: string }>(
      env.DB.prepare("SELECT storage_key FROM documents WHERE owner_id=?").bind(member.id),
    );
    const statements: D1PreparedStatement[] = documents.map((doc) =>
      env.DB.prepare("INSERT INTO document_deletion_queue (id,storage_key) VALUES (?,?)").bind(
        uid(),
        doc.storage_key,
      ),
    );
    statements.push(
      env.DB.prepare(
        "DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM transactions WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM imports WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM accounts WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM investments WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM payments WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM audit_log WHERE resource_id IN (SELECT id FROM documents WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare("DELETE FROM audit_log WHERE actor_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM shares WHERE owner_id=?").bind(member.id),
      env.DB.prepare(
        "DELETE FROM reminder_deliveries WHERE payment_id IN (SELECT id FROM payments WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM payment_occurrences WHERE payment_id IN (SELECT id FROM payments WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM investment_snapshots WHERE investment_id IN (SELECT id FROM investments WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM fd_report_observations WHERE investment_id IN (SELECT id FROM investments WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM statement_balances WHERE account_id IN (SELECT id FROM accounts WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare(
        "DELETE FROM transaction_import_sources WHERE transaction_id IN (SELECT id FROM transactions WHERE owner_id=?)",
      ).bind(member.id),
      env.DB.prepare("DELETE FROM transactions WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM imports WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM payments WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM investments WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM accounts WHERE owner_id=?").bind(member.id),
      env.DB.prepare("DELETE FROM documents WHERE owner_id=?").bind(member.id),
    );
    await env.DB.batch(statements);
    await audit(env, member, "delete_financial_data", "member", member.id, {
      documents: documents.length,
    });
    await clearDeletedDocuments(env);
    return json({ ok: true, documents_queued: documents.length });
  }
  return null;
}
