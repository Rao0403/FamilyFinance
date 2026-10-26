import { visible } from "../auth/resource-permissions";
import { readAll } from "../lib/database";
import { json } from "../lib/http";
import type { RouteContext } from "../types/route-context";

export async function handleReportsRoutes(context: RouteContext): Promise<Response | null> {
  const { env, member, method, key } = context;
  if (key === "reports" && method === "GET") {
    const accounts = await visible<{
      id: string;
      opening_date: string | null;
      opening_balance_paise: number;
    }>(env, member, "accounts", "account");
    const investments = await visible<{
      id: string;
      type: string;
      principal_paise: number | null;
      start_date: string | null;
    }>(env, member, "investments", "investment");
    const ids = accounts.map((a) => a.id);
    const rows = ids.length
      ? await readAll<{
          date: string;
          kind: string;
          category: string;
          amount_paise: number;
          account_id: string;
          balance_paise: number | null;
        }>(
          env.DB.prepare(
            `SELECT date,kind,category,amount_paise,account_id,balance_paise FROM transactions WHERE account_id IN (${ids.map(() => "?").join(",")})`,
          ).bind(...ids),
        )
      : [];
    const snapshots = investments.length
      ? await readAll<{ investment_id: string; as_of: string; value_paise: number }>(
          env.DB.prepare(
            `SELECT investment_id,as_of,value_paise FROM investment_snapshots WHERE investment_id IN (${investments.map(() => "?").join(",")})`,
          ).bind(...investments.map((i) => i.id)),
        )
      : [];
    const monthly = new Map<
      string,
      { month: string; income_paise: number; spending_paise: number }
    >();
    const categories = new Map<string, number>();
    for (const row of rows) {
      const month = row.date.slice(0, 7),
        item = monthly.get(month) || { month, income_paise: 0, spending_paise: 0 };
      if (row.kind === "expense") {
        item.spending_paise += Math.abs(row.amount_paise);
        categories.set(
          row.category,
          (categories.get(row.category) || 0) + Math.abs(row.amount_paise),
        );
      }
      if (row.kind === "income") item.income_paise += row.amount_paise;
      monthly.set(month, item);
    }
    const eventMonths = new Set<string>([
      ...accounts.map((a) => a.opening_date?.slice(0, 7)).filter((x): x is string => !!x),
      ...rows.filter((r) => r.balance_paise != null).map((r) => r.date.slice(0, 7)),
      ...snapshots.map((s) => s.as_of.slice(0, 7)),
      ...investments
        .filter((i) => i.type === "fd")
        .map((i) => i.start_date?.slice(0, 7))
        .filter((x): x is string => !!x),
    ]);
    const history: { month: string; net_worth_paise: number; stale: boolean }[] = [];
    for (const month of [...eventMonths].sort().slice(-24)) {
      const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10);
      let total = 0,
        missing = false,
        stale = false;
      for (const account of accounts) {
        const eligible = rows.filter((r) => r.account_id === account.id && r.date <= end);
        const statement = eligible
          .filter((r) => r.balance_paise != null)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        const baselineDate = statement?.date ?? account.opening_date;
        if (!baselineDate || baselineDate > end) {
          missing = true;
          break;
        }
        total +=
          (statement?.balance_paise ?? account.opening_balance_paise) +
          eligible.filter((r) => r.date > baselineDate).reduce((sum, r) => sum + r.amount_paise, 0);
        if (
          Date.parse(`${end}T00:00:00Z`) - Date.parse(`${baselineDate}T00:00:00Z`) >
          45 * 86400000
        )
          stale = true;
      }
      if (missing) continue;
      for (const investment of investments) {
        const snapshot = snapshots
          .filter((s) => s.investment_id === investment.id && s.as_of <= end)
          .sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
        const asOf = snapshot?.as_of ?? (investment.type === "fd" ? investment.start_date : null);
        if (!asOf || asOf > end || (snapshot == null && investment.principal_paise == null)) {
          missing = true;
          break;
        }
        total += snapshot?.value_paise ?? investment.principal_paise ?? 0;
        if (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`) > 45 * 86400000)
          stale = true;
      }
      if (!missing) history.push({ month, net_worth_paise: total, stale });
    }
    return json({
      monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
      categories: [...categories.entries()]
        .map(([category, amount_paise]) => ({ category, amount_paise }))
        .sort((a, b) => b.amount_paise - a.amount_paise),
      history,
    });
  }
  return null;
}
