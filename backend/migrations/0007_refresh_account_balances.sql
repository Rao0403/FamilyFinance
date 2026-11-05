-- Recalculate stored balances with the newest dated statement or manually entered balance.
WITH candidates AS (
  SELECT a.id AS account_id, a.opening_date AS date, a.opening_balance_paise AS balance_paise, 0 AS priority, '' AS created_at
  FROM accounts a WHERE a.opening_date IS NOT NULL
  UNION ALL
  SELECT s.account_id, s.closing_date, s.balance_paise, 1, ''
  FROM statement_balances s
  UNION ALL
  SELECT t.account_id, t.date, t.balance_paise, 1, t.created_at
  FROM transactions t
  WHERE t.balance_paise IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM statement_balances s WHERE s.account_id=t.account_id)
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY date DESC, priority DESC, created_at DESC) AS rank
  FROM candidates
)
UPDATE accounts SET
  balance_paise = COALESCE((SELECT balance_paise FROM ranked WHERE account_id=accounts.id AND rank=1), opening_balance_paise)
    + COALESCE((SELECT SUM(t.amount_paise) FROM transactions t WHERE t.account_id=accounts.id
      AND t.date > COALESCE((SELECT date FROM ranked WHERE account_id=accounts.id AND rank=1), '0000-00-00')), 0),
  balance_as_of = (SELECT date FROM ranked WHERE account_id=accounts.id AND rank=1);
