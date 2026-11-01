CREATE TABLE statement_balances (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  document_id TEXT NOT NULL UNIQUE REFERENCES documents(id),
  closing_date TEXT NOT NULL,
  balance_paise INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_statement_balances_account_date ON statement_balances(account_id, closing_date);
CREATE TRIGGER prevent_conflicting_statement_balance
BEFORE INSERT ON statement_balances
WHEN EXISTS (
  SELECT 1 FROM statement_balances
  WHERE account_id=NEW.account_id AND closing_date=NEW.closing_date AND balance_paise<>NEW.balance_paise
)
BEGIN
  SELECT RAISE(ABORT, 'Conflicting statement balance');
END;
CREATE TABLE transaction_import_sources (
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  source_ref TEXT,
  PRIMARY KEY(transaction_id, document_id)
);
INSERT INTO transaction_import_sources (transaction_id, document_id, source_ref)
SELECT id, document_id, source_ref FROM transactions WHERE document_id IS NOT NULL;
