import { visible } from "../auth/resource-permissions";
import { readAll } from "../lib/database";
import { json } from "../lib/http";
import type { RecordRow } from "../types/records";
import type { RouteContext } from "../types/route-context";

export async function handleDashboardRoutes(context: RouteContext): Promise<Response | null> {
  const { env, member, method, key } = context;
  if (key === "dashboard" && method === "GET") {
    const accounts = await visible<RecordRow & { id: string }>(env, member, "accounts", "account");
    const investments = await visible<RecordRow & { id: string }>(
      env,
      member,
      "investments",
      "investment",
    );
    const payments = await visible<RecordRow & { id: string }>(env, member, "payments", "payment");
    let investmentValue = 0;
    for (const investment of investments) {
      const latest = await env.DB.prepare(
        "SELECT value_paise,as_of FROM investment_snapshots WHERE investment_id=? ORDER BY as_of DESC LIMIT 1",
      )
        .bind(investment.id)
        .first<{ value_paise: number; as_of: string }>();
      investmentValue += latest?.value_paise ?? Number(investment.principal_paise ?? 0);
      investment.value_paise = latest?.value_paise ?? investment.principal_paise ?? 0;
      investment.as_of = latest?.as_of ?? investment.fd_report_date ?? investment.start_date;
    }
    const ids = accounts.map((a) => a.id);
    const month = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" })
      .slice(0, 7);
    const txs = ids.length
      ? await readAll<{ amount_paise: number; kind: string; category: string }>(
          env.DB.prepare(
            `SELECT amount_paise,kind,category FROM transactions WHERE account_id IN (${ids.map(() => "?").join(",")}) AND date LIKE ?`,
          ).bind(...ids, `${month}%`),
        )
      : [];
    return json({
      accounts,
      investments,
      payments,
      bank_paise: accounts.reduce((s, a) => s + Number(a.balance_paise), 0),
      investment_paise: investmentValue,
      spending_paise: -txs
        .filter((t) => t.kind === "expense")
        .reduce((s, t) => s + t.amount_paise, 0),
      income_paise: txs.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount_paise, 0),
      month,
    });
  }
  return null;
}
