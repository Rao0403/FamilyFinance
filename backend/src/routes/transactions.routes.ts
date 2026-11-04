import { canEdit, canView, owns, visible } from "../auth/resource-permissions";
import { readAll } from "../lib/database";
import { body, fail, json } from "../lib/http";
import { uid } from "../lib/identifiers";
import { asDate, asMoney, asText } from "../lib/validation";
import { accountBalanceStatement } from "../services/account-balances";
import { audit } from "../services/audit-log";
import type { RecordRow } from "../types/records";
import type { RouteContext } from "../types/route-context";

export async function handleTransactionsRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, url, path, method, key } = context;
  if (key === "transactions") {
    if (method === "GET") {
      const accountId = url.searchParams.get("account_id");
      if (accountId && !(await canView(env, member, "account", accountId)))
        return fail(403, "Access denied");
      const accounts = accountId
        ? [accountId]
        : (await visible<{ id: string }>(env, member, "accounts", "account")).map((a) => a.id);
      if (!accounts.length) return json([]);
      const rows = await readAll(
        env.DB.prepare(
          `SELECT * FROM transactions WHERE account_id IN (${accounts.map(() => "?").join(",")}) ORDER BY date DESC, created_at DESC`,
        ).bind(...accounts),
      );
      return json(rows);
    }
    if (method === "POST") {
      const data = await body(request),
        accountId = asText(data.account_id);
      if (!(await owns(env, member, "accounts", accountId)))
        return fail(403, "Only the account owner can add transactions");
      const id = uid(),
        date = asDate(data.date),
        amount = asMoney(data.amount_paise);
      await env.DB.prepare(
        "INSERT INTO transactions (id,owner_id,account_id,date,description,amount_paise,category,kind,balance_paise) VALUES (?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          member.id,
          accountId,
          date,
          asText(data.description, 500),
          amount,
          asText(data.category) || "Uncategorized",
          asText(data.kind) || (amount < 0 ? "expense" : "income"),
          data.balance_paise == null ? null : asMoney(data.balance_paise),
        )
        .run();
      await (await accountBalanceStatement(env, accountId)).run();
      await audit(env, member, "create", "transaction", id);
      return json({ id }, 201);
    }
    if (method === "PATCH" && path[1]) {
      const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id=?")
        .bind(path[1])
        .first<RecordRow>();
      if (!tx) return fail(404, "Transaction not found");
      if (!(await canEdit(env, member, "account", String(tx.account_id))))
        return fail(403, "Edit access denied");
      const data = await body(request);
      const newAmount =
        data.amount_paise == null ? Number(tx.amount_paise) : asMoney(data.amount_paise);
      const newDate = data.date == null ? String(tx.date) : asDate(data.date);
      await env.DB.prepare(
        "UPDATE transactions SET date=?,amount_paise=?,category=?,kind=?,description=? WHERE id=?",
      )
        .bind(
          newDate,
          newAmount,
          asText(data.category) || tx.category,
          asText(data.kind) || tx.kind,
          asText(data.description, 500) || tx.description,
          path[1],
        )
        .run();
      await (await accountBalanceStatement(env, String(tx.account_id))).run();
      await audit(env, member, "edit", "transaction", path[1], {
        previous_amount_paise: tx.amount_paise,
        amount_paise: newAmount,
      });
      return json({ ok: true });
    }
  }
  return null;
}
