CREATE TABLE investment_presence_events (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  as_of TEXT NOT NULL,
  present INTEGER NOT NULL CHECK (present IN (0, 1)),
  UNIQUE(investment_id, document_id)
);
CREATE INDEX idx_investment_presence_latest ON investment_presence_events(investment_id, as_of DESC);
