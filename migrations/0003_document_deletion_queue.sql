CREATE TABLE document_deletion_queue (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT);
CREATE INDEX idx_document_deletion_pending ON document_deletion_queue(completed_at);
