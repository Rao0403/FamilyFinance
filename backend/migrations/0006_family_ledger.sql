CREATE TABLE family_ledger (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES members(id),
  recipient_id TEXT NOT NULL REFERENCES members(id),
  date TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  kind TEXT NOT NULL CHECK(kind IN ('pocket_money','expense_contribution','gift','other','loan','opening_loan','repayment')),
  note TEXT NOT NULL DEFAULT '',
  loan_id TEXT REFERENCES family_ledger(id),
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(sender_id <> recipient_id),
  CHECK((kind = 'repayment' AND loan_id IS NOT NULL) OR (kind <> 'repayment' AND loan_id IS NULL))
);
CREATE TABLE family_ledger_proposals (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  proposer_id TEXT NOT NULL REFERENCES members(id),
  approver_id TEXT NOT NULL REFERENCES members(id),
  action TEXT NOT NULL CHECK(action IN ('create','edit','delete')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(proposer_id <> approver_id)
);
CREATE UNIQUE INDEX one_pending_ledger_change ON family_ledger_proposals(entry_id) WHERE status='pending';
CREATE TABLE family_ledger_transaction_links (
  entry_id TEXT NOT NULL REFERENCES family_ledger(id),
  owner_id TEXT NOT NULL REFERENCES members(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  PRIMARY KEY(entry_id, owner_id),
  UNIQUE(owner_id, transaction_id)
);

CREATE TRIGGER family_ledger_repayment_insert BEFORE INSERT ON family_ledger WHEN NEW.kind='repayment' BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM family_ledger l WHERE l.id=NEW.loan_id AND l.kind IN ('loan','opening_loan') AND l.deleted=0 AND l.sender_id=NEW.recipient_id AND l.recipient_id=NEW.sender_id AND l.date<=NEW.date AND l.amount_paise >= NEW.amount_paise + COALESCE((SELECT SUM(r.amount_paise) FROM family_ledger r WHERE r.loan_id=l.id AND r.deleted=0),0)) THEN RAISE(ABORT,'Invalid or excessive repayment') END;
END;
CREATE TRIGGER family_ledger_repayment_update BEFORE UPDATE ON family_ledger WHEN NEW.kind='repayment' AND NEW.deleted=0 BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM family_ledger l WHERE l.id=NEW.loan_id AND l.kind IN ('loan','opening_loan') AND l.deleted=0 AND l.sender_id=NEW.recipient_id AND l.recipient_id=NEW.sender_id AND l.date<=NEW.date AND l.amount_paise >= NEW.amount_paise + COALESCE((SELECT SUM(r.amount_paise) FROM family_ledger r WHERE r.loan_id=l.id AND r.deleted=0 AND r.id<>NEW.id),0)) THEN RAISE(ABORT,'Invalid or excessive repayment') END;
END;
CREATE TRIGGER family_ledger_loan_update BEFORE UPDATE ON family_ledger WHEN OLD.kind IN ('loan','opening_loan') AND EXISTS (SELECT 1 FROM family_ledger r WHERE r.loan_id=OLD.id AND r.deleted=0) BEGIN
  SELECT CASE WHEN NEW.deleted=1 OR NEW.kind NOT IN ('loan','opening_loan') OR NEW.sender_id<>OLD.sender_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.amount_paise < (SELECT SUM(r.amount_paise) FROM family_ledger r WHERE r.loan_id=OLD.id AND r.deleted=0) OR EXISTS (SELECT 1 FROM family_ledger r WHERE r.loan_id=OLD.id AND r.deleted=0 AND r.date<NEW.date) THEN RAISE(ABORT,'Loan has repayments; adjust them first') END;
END;
CREATE TRIGGER family_ledger_confirm AFTER UPDATE OF status ON family_ledger_proposals WHEN OLD.status='pending' AND NEW.status='confirmed' BEGIN
  INSERT INTO family_ledger(id,sender_id,recipient_id,date,amount_paise,kind,note,loan_id)
    SELECT NEW.entry_id,json_extract(NEW.payload,'$.sender_id'),json_extract(NEW.payload,'$.recipient_id'),json_extract(NEW.payload,'$.date'),json_extract(NEW.payload,'$.amount_paise'),json_extract(NEW.payload,'$.kind'),json_extract(NEW.payload,'$.note'),json_extract(NEW.payload,'$.loan_id') WHERE NEW.action='create';
  UPDATE family_ledger SET date=json_extract(NEW.payload,'$.date'),amount_paise=json_extract(NEW.payload,'$.amount_paise'),kind=json_extract(NEW.payload,'$.kind'),note=json_extract(NEW.payload,'$.note'),loan_id=json_extract(NEW.payload,'$.loan_id') WHERE id=NEW.entry_id AND NEW.action='edit' AND deleted=0;
  UPDATE family_ledger SET deleted=1 WHERE id=NEW.entry_id AND NEW.action='delete' AND deleted=0;
END;
