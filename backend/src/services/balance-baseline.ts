export type BalanceBaseline = { date: string; balance_paise: number };

/** Statement balances win ties: the report's ending balance covers that entire date. */
export function selectBalanceBaseline(
  statement: BalanceBaseline | null,
  opening: BalanceBaseline | null,
): BalanceBaseline | null {
  if (!statement) return opening;
  if (!opening || statement.date >= opening.date) return statement;
  return opening;
}
