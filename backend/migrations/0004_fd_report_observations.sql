ALTER TABLE investments ADD COLUMN fd_report_date TEXT;
CREATE UNIQUE INDEX idx_fd_import_identity ON investments(owner_id, symbol) WHERE type='fd' AND symbol LIKE 'fd:%';
CREATE TABLE fd_report_observations (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  report_date TEXT NOT NULL,
  start_date TEXT NOT NULL,
  principal_paise INTEGER NOT NULL,
  rate_bps INTEGER,
  maturity_date TEXT,
  maturity_amount_paise INTEGER,
  source_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(investment_id, document_id)
);
