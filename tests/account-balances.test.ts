import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { selectBalanceBaseline } from "../backend/src/services/balance-baseline";

test("newest dated balance wins, with statement winning a same-day tie", () => {
  const statement = { date: "2024-03-01", balance_paise: 100000 };
  const newer = { date: "2024-03-05", balance_paise: 150000 };
  assert.deepEqual(selectBalanceBaseline(statement, newer), newer);
  assert.deepEqual(selectBalanceBaseline(statement, { ...newer, date: "2024-02-01" }), statement);
  assert.deepEqual(selectBalanceBaseline(statement, { ...newer, date: statement.date }), statement);
  assert.deepEqual(selectBalanceBaseline(null, newer), newer);
});

test("migration recalculates balances without double counting older or same-date transactions", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE accounts(id TEXT PRIMARY KEY, opening_date TEXT, opening_balance_paise INTEGER, balance_paise INTEGER, balance_as_of TEXT);
    CREATE TABLE statement_balances(account_id TEXT, closing_date TEXT, balance_paise INTEGER);
    CREATE TABLE transactions(account_id TEXT, date TEXT, balance_paise INTEGER, amount_paise INTEGER, created_at TEXT);
    INSERT INTO accounts VALUES ('a','2024-03-05',150000,0,NULL), ('b','2024-03-01',100000,0,NULL), ('c',NULL,50000,0,NULL);
    INSERT INTO statement_balances VALUES ('a','2024-03-01',100000), ('b','2024-03-01',120000);
    INSERT INTO transactions VALUES ('a','2024-03-03',NULL,-1000,''), ('a','2024-03-05',NULL,-2000,''), ('a','2024-03-06',NULL,3000,''), ('b','2024-03-02',NULL,-5000,''), ('c','2024-03-01',NULL,1000,'');
  `);
  db.exec(
    readFileSync(
      new URL("../backend/migrations/0007_refresh_account_balances.sql", import.meta.url),
      "utf8",
    ),
  );
  const result = db
    .prepare("SELECT id,balance_paise,balance_as_of FROM accounts ORDER BY id")
    .all();
  assert.deepEqual(
    result.map((row) => [row.id, row.balance_paise, row.balance_as_of]),
    [
      ["a", 153000, "2024-03-05"],
      ["b", 115000, "2024-03-01"],
      ["c", 51000, null],
    ],
  );
  db.close();
});
