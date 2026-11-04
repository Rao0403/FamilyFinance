import { canEdit, canView, owns, visible } from "../auth/resource-permissions";
import { body, fail, json } from "../lib/http";
import { now, uid } from "../lib/identifiers";
import { asDate, asMoney, asText } from "../lib/validation";
import { audit } from "../services/audit-log";
import { nextDue } from "../services/payment-schedule";
import type { RecordRow } from "../types/records";
import type { RouteContext } from "../types/route-context";

export async function handlePaymentsRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, path, method, key } = context;
  if (key === "payments") {
    if (method === "GET") {
      const rows = await visible<RecordRow & { id: string }>(env, member, "payments", "payment");
      for (const row of rows)
        row.last_paid = await env.DB.prepare(
          "SELECT due_date,paid_at,transaction_id FROM payment_occurrences WHERE payment_id=? AND status='paid' ORDER BY due_date DESC LIMIT 1",
        )
          .bind(row.id)
          .first();
      return json(rows);
    }
    if (method === "POST" && !path[1]) {
      const data = await body(request),
        id = uid(),
        frequency = asText(data.frequency) || "once";
      if (!["once", "weekly", "monthly", "quarterly", "yearly"].includes(frequency))
        return fail(400, "Invalid frequency");
      if (data.account_id && !(await owns(env, member, "accounts", asText(data.account_id))))
        return fail(403, "Linked account must belong to the payment owner");
      await env.DB.prepare(
        "INSERT INTO payments (id,owner_id,title,amount_paise,next_due_date,frequency,account_id,remind_days,email_enabled,sms_enabled) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          member.id,
          asText(data.title),
          asMoney(data.amount_paise),
          asDate(data.next_due_date),
          frequency,
          data.account_id || null,
          Math.min(Math.max(Number(data.remind_days ?? 3), 0), 30),
          data.email_enabled === false ? 0 : 1,
          0,
        )
        .run();
      await audit(env, member, "create", "payment", id);
      return json({ id }, 201);
    }
    if (path[1] && path[2] === "paid" && method === "POST") {
      const payment = await env.DB.prepare("SELECT * FROM payments WHERE id=?")
        .bind(path[1])
        .first<RecordRow>();
      if (!payment) return fail(404, "Payment not found");
      if (!(await canEdit(env, member, "payment", path[1]))) return fail(403, "Edit access denied");
      if (!payment.active) return fail(400, "Payment is already completed");
      const data = await body(request);
      const transactionId = data.transaction_id ? asText(data.transaction_id) : null;
      if (transactionId) {
        const transaction = await env.DB.prepare(
          "SELECT id,owner_id,account_id,amount_paise FROM transactions WHERE id=?",
        )
          .bind(transactionId)
          .first<{ id: string; owner_id: string; account_id: string; amount_paise: number }>();
        if (
          !transaction ||
          transaction.owner_id !== payment.owner_id ||
          !(await canView(env, member, "account", transaction.account_id))
        )
          return fail(403, "Transaction cannot be linked to this payment");
        if (transaction.amount_paise !== -Number(payment.amount_paise))
          return fail(400, "Transaction amount must match the payment");
        if (
          await env.DB.prepare(
            "SELECT id FROM payment_occurrences WHERE transaction_id=? AND status='paid'",
          )
            .bind(transactionId)
            .first()
        )
          return fail(409, "Transaction is already linked to a payment");
      }
      const due = String(payment.next_due_date),
        id = uid();
      await env.DB.prepare(
        "INSERT INTO payment_occurrences (id,payment_id,due_date,status,paid_at,transaction_id) VALUES (?,?,?,'paid',?,?) ON CONFLICT(payment_id,due_date) DO UPDATE SET status='paid',paid_at=excluded.paid_at,transaction_id=excluded.transaction_id",
      )
        .bind(id, path[1], due, now(), transactionId)
        .run();
      const next = nextDue(due, String(payment.frequency));
      await env.DB.prepare("UPDATE payments SET next_due_date=?,active=? WHERE id=?")
        .bind(next ?? due, next ? 1 : 0, path[1])
        .run();
      await audit(env, member, "paid", "payment", path[1], { due, transaction_id: transactionId });
      return json({ ok: true });
    }
  }
  return null;
}
