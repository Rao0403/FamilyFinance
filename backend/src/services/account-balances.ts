import type { Env } from "../types/environment";
import { selectBalanceBaseline } from "./balance-baseline";

export async function accountBalanceStatement(
  env: Env,
  accountId: string,
): Promise<D1PreparedStatement> {
  const account = await env.DB.prepare(
    "SELECT opening_balance_paise,opening_date FROM accounts WHERE id=?",
  )
    .bind(accountId)
    .first<{ opening_balance_paise: number; opening_date: string | null }>();
  if (!account) throw new Error("Account not found");
  let latest = await env.DB.prepare(
    "SELECT closing_date AS date,balance_paise FROM statement_balances WHERE account_id=? ORDER BY closing_date DESC,rowid DESC LIMIT 1",
  )
    .bind(accountId)
    .first<{ date: string; balance_paise: number }>();
  if (!latest) {
    latest = await env.DB.prepare(
      "SELECT date,balance_paise FROM transactions WHERE account_id=? AND balance_paise IS NOT NULL ORDER BY date DESC,created_at DESC LIMIT 1",
    )
      .bind(accountId)
      .first<{ date: string; balance_paise: number }>();
  }
  const selected = selectBalanceBaseline(
    latest,
    account.opening_date
      ? { date: account.opening_date, balance_paise: account.opening_balance_paise }
      : null,
  );
  const baseline = selected?.date ?? "0000-00-00";
  const newer = await env.DB.prepare(
    "SELECT coalesce(sum(amount_paise),0) AS amount FROM transactions WHERE account_id=? AND date>?",
  )
    .bind(accountId, baseline)
    .first<{ amount: number }>();
  return env.DB.prepare("UPDATE accounts SET balance_paise=?,balance_as_of=? WHERE id=?").bind(
    (selected?.balance_paise ?? account.opening_balance_paise) + (newer?.amount ?? 0),
    selected?.date ?? null,
    accountId,
  );
}
