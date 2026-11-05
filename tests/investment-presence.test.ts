import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleImportsRoutes } from "../backend/src/routes/imports.routes";
import { visible } from "../backend/src/auth/resource-permissions";

test("reports update holdings, confirm closures, preserve history and respect owners and report dates", async () => {
  const db = new DatabaseSync(":memory:");
  for (let i = 1; i <= 8; i++) {
    const files = [
      "0001_initial.sql",
      "0002_import_origin.sql",
      "0003_document_deletion_queue.sql",
      "0004_fd_report_observations.sql",
      "0005_statement_balances.sql",
      "0006_family_ledger.sql",
      "0007_refresh_account_balances.sql",
      "0008_investment_presence.sql",
    ];
    db.exec(
      readFileSync(new URL(`../backend/migrations/${files[i - 1]}`, import.meta.url), "utf8"),
    );
  }
  db.exec(
    "INSERT INTO members(id,email,name) VALUES ('owner','owner@example.invalid','Owner'),('other','other@example.invalid','Other')",
  );
  const wrap = (sql: string, args: unknown[] = []): any => ({
    bind: (...values: unknown[]) => wrap(sql, values),
    first: async () => db.prepare(sql).get(...(args as any[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) }),
    run: async () => ({
      meta: { changes: Number(db.prepare(sql).run(...(args as any[])).changes) },
    }),
  });
  const env: any = {
    DB: {
      prepare: (sql: string) => wrap(sql),
      batch: async (items: any[]) => {
        db.exec("BEGIN");
        try {
          const out = [];
          for (const item of items) out.push(await item.run());
          db.exec("COMMIT");
          return out;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
  const member: any = {
    id: "owner",
    email: "owner@example.invalid",
    name: "Owner",
    phone: null,
    role: "member",
    active: 1,
  };
  const other = { ...member, id: "other", email: "other@example.invalid" };
  const request = async (path: string[], data: unknown, actor = member) => {
    const response = await handleImportsRoutes({
      key: "imports",
      path,
      method: "POST",
      request: new Request("http://localhost/api/imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
      env,
      member: actor,
      url: new URL("http://localhost/api/imports"),
    } as any);
    assert.ok(response);
    return { status: response.status, data: (await response.json()) as any };
  };
  const document = (id: string, type: string) => {
    db.prepare(
      "INSERT INTO documents(id,owner_id,type,name,mime_type,size_bytes,sha256,storage_key) VALUES (?, 'owner', ?, ?, 'application/pdf',1,?,?)",
    ).run(id, type, id, id, id);
    db.prepare(
      "INSERT INTO imports(id,owner_id,document_id,type,status) VALUES (?, 'owner', ?, ?, 'pending')",
    ).run(`batch-${id}`, id, type);
  };
  const fd = (identity: string, date: string) => ({
    identity_hash: identity.repeat(64),
    account_suffix: "1234",
    start_date: "2024-01-01",
    report_date: date,
    principal_paise: 100000,
    rate_bps: 600,
    maturity_date: "2025-01-01",
    maturity_amount_paise: 106000,
  });
  document("fd1", "fd");
  assert.equal(
    (
      await request(["imports", "fd1", "commit"], {
        rows: [fd("a", "2024-02-01"), fd("b", "2024-02-01")],
      })
    ).status,
    200,
  );
  const diff = await request(["imports", "compare"], { kind: "fd", rows: [fd("a", "2024-03-01")] });
  assert.equal(diff.data.missing.length, 1);
  const missingId = diff.data.missing[0].id;
  assert.deepEqual(
    (await request(["imports", "compare"], { kind: "fd", rows: [fd("a", "2024-03-01")] }, other))
      .data.missing,
    [],
  );
  assert.deepEqual(
    (await request(["imports", "compare"], { kind: "fd", rows: [fd("a", "2024-01-15")] })).data
      .missing,
    [],
  );
  document("fd2", "fd");
  assert.equal(
    (
      await request(["imports", "fd2", "commit"], {
        rows: [fd("a", "2024-03-01")],
        closed_ids: [missingId],
      })
    ).status,
    200,
  );
  assert.equal((await visible(env, member, "investments", "investment")).length, 1);
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM fd_report_observations WHERE investment_id=?")
      .get(missingId)?.n,
    1,
  );
  document("fd-old", "fd");
  assert.equal(
    (await request(["imports", "fd-old", "commit"], { rows: [fd("b", "2024-02-15")] })).status,
    200,
  );
  assert.equal((await visible(env, member, "investments", "investment")).length, 1);
  document("fd3", "fd");
  assert.equal(
    (await request(["imports", "fd3", "commit"], { rows: [fd("b", "2024-04-01")] })).status,
    200,
  );
  assert.equal((await visible(env, member, "investments", "investment")).length, 2);
  assert.equal((await request(["imports", "fd3", "rollback"], {})).status, 200);
  assert.equal((await visible(env, member, "investments", "investment")).length, 1);
  const fund = (name: string, date: string) => ({
    type: "mutual_fund",
    name,
    symbol: name,
    as_of: date,
    invested_paise: 10000,
    value_paise: 12000,
  });
  document("mf1", "investment");
  assert.equal(
    (
      await request(["imports", "mf1", "commit"], {
        rows: [fund("Fund A", "2024-02-01"), fund("Fund B", "2024-02-01")],
      })
    ).status,
    200,
  );
  const funds = await request(["imports", "compare"], {
    kind: "investment",
    rows: [fund("Fund A", "2024-03-01")],
  });
  assert.equal(funds.data.missing.length, 1);
  document("mf2", "investment");
  assert.equal(
    (
      await request(["imports", "mf2", "commit"], {
        rows: [fund("Fund A", "2024-03-01")],
        closed_ids: [funds.data.missing[0].id],
      })
    ).status,
    200,
  );
  const visibleFunds: any[] = await visible(env, member, "investments", "investment");
  assert.deepEqual(
    visibleFunds.filter((item) => item.type === "mutual_fund").map((item) => item.name),
    ["Fund A"],
  );
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM investment_snapshots WHERE investment_id=?")
      .get(funds.data.missing[0].id)?.n,
    1,
  );
  db.close();
});
