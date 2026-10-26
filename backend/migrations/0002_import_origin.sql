ALTER TABLE investments ADD COLUMN created_import_id TEXT;
CREATE INDEX idx_investments_import_origin ON investments(created_import_id);
