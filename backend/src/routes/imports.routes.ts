import { readAll } from "../lib/database";
import { body, fail, json } from "../lib/http";
import { now, uid } from "../lib/identifiers";
import { asDate, asMoney, asText } from "../lib/validation";
import { accountBalanceStatement } from "../services/account-balances";
import { audit } from "../services/audit-log";
import { commitFixedDeposits, rollbackFixedDeposits } from "../services/fixed-deposit-import";
import { compareInvestmentReport, holdingKey } from "../services/investment-presence";
import type { RecordRow } from "../types/records";
import type { RouteContext } from "../types/route-context";

export async function handleImportsRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, path, method, key } = context;
  if (key === "imports" && path[1] === "compare" && method === "POST") {
    const data = await body(request);
    const rows = Array.isArray(data.rows) ? (data.rows as RecordRow[]) : [];
    if (rows.length > 1000) return fail(400, "Import limit is 1000 rows");
    return json(await compareInvestmentReport(env, member, asText(data.kind), rows));
  }
  if (key === "imports" && path[1] && !path[2] && method === "GET") {
    const batch = await env.DB.prepare(
      "SELECT id,document_id,target_id,type,status,created_at,committed_at FROM imports WHERE document_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(path[1], member.id)
      .first();
    return batch ? json(batch) : fail(404, "Import not found");
  }
  if (key === "imports" && path[1] && path[2] === "commit" && method === "POST") {
    const batch = await env.DB.prepare(
      "SELECT * FROM imports WHERE document_id=? AND owner_id=? AND status='pending'",
    )
      .bind(path[1], member.id)
      .first<RecordRow>();
    if (!batch) return fail(404, "Pending import not found");
    const data = await body(request),
      rows = Array.isArray(data.rows) ? (data.rows as RecordRow[]) : [];
    if (rows.length > 1000) return fail(400, "Import limit is 1000 rows");
    const closedIds = Array.isArray(data.closed_ids) ? data.closed_ids.map((id) => asText(id)) : [];
    const comparison =
      batch.type === "fd" || batch.type === "investment"
        ? await compareInvestmentReport(env, member, String(batch.type), rows)
        : { date: "", missing: [] };
    const eligible = new Set(comparison.missing.map((item) => item.id));
    if (new Set(closedIds).size !== closedIds.length || closedIds.some((id) => !eligible.has(id)))
      return fail(409, "The report comparison changed. Review the import again.");
    let imported = 0,
      duplicates = 0;
    if (batch.type === "fd") {
      imported = await commitFixedDeposits(
        env,
        member,
        path[1],
        String(batch.id),
        rows,
        closedIds,
        comparison.date,
      );
    } else if (batch.type === "account" && batch.target_id) {
      if (!data.statement || typeof data.statement !== "object" || Array.isArray(data.statement))
        return fail(400, "Enter the statement end date and ending balance");
      const statement = data.statement as RecordRow;
      const closingDate = asDate(statement.closing_date),
        closingBalance = asMoney(statement.balance_paise);
      const conflict = await env.DB.prepare(
        "SELECT id FROM statement_balances WHERE account_id=? AND closing_date=? AND balance_paise<>? LIMIT 1",
      )
        .bind(batch.target_id, closingDate, closingBalance)
        .first();
      if (conflict)
        return fail(
          409,
          "A statement for this end date already has a different ending balance. Check both statements.",
        );
      const statements: D1PreparedStatement[] = [];
      const transactionIndexes: number[] = [];
      for (const row of rows) {
        const date = asDate(row.date),
          amount = asMoney(row.amount_paise),
          description = asText(row.description, 500);
        if (!description || date > closingDate)
          return fail(400, "Check the transaction descriptions and statement end date");
        const fingerprint = `${date}|${amount}|${description}|${row.balance_paise ?? ""}`;
        transactionIndexes.push(statements.length);
        statements.push(
          env.DB.prepare(
            "INSERT OR IGNORE INTO transactions (id,owner_id,account_id,date,description,amount_paise,category,kind,balance_paise,document_id,source_ref,fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          ).bind(
            uid(),
            member.id,
            batch.target_id,
            date,
            description,
            amount,
            asText(row.category) || "Uncategorized",
            asText(row.kind) || (amount < 0 ? "expense" : "income"),
            row.balance_paise == null ? null : asMoney(row.balance_paise),
            path[1],
            asText(row.source_ref) || null,
            fingerprint,
          ),
        );
        statements.push(
          env.DB.prepare(
            "INSERT OR IGNORE INTO transaction_import_sources (transaction_id,document_id,source_ref) SELECT id,?,? FROM transactions WHERE account_id=? AND fingerprint=?",
          ).bind(path[1], asText(row.source_ref) || null, batch.target_id, fingerprint),
        );
      }
      statements.push(
        env.DB.prepare(
          "INSERT INTO statement_balances (id,account_id,document_id,closing_date,balance_paise) VALUES (?,?,?,?,?)",
        ).bind(uid(), batch.target_id, path[1], closingDate, closingBalance),
      );
      statements.push(
        env.DB.prepare("UPDATE imports SET status='committed',committed_at=? WHERE id=?").bind(
          now(),
          batch.id,
        ),
      );
      statements.push(
        env.DB.prepare("UPDATE documents SET status='imported' WHERE id=?").bind(path[1]),
      );
      const results = await env.DB.batch(statements);
      imported = transactionIndexes.reduce((sum, index) => sum + results[index].meta.changes, 0);
      duplicates = rows.length - imported;
      await (await accountBalanceStatement(env, String(batch.target_id))).run();
    } else if (batch.type === "investment") {
      const existing = await readAll<{
        id: string;
        type: string;
        name: string;
        symbol: string | null;
      }>(
        env.DB.prepare("SELECT id,type,name,symbol FROM investments WHERE owner_id=?").bind(
          member.id,
        ),
      );
      const keyFor = holdingKey;
      const known = new Map(
        existing.map((item) => [keyFor(item.type, item.name, item.symbol || ""), item.id]),
      );
      const statements: D1PreparedStatement[] = [],
        snapshotIndexes: number[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const name = asText(row.name),
          type = asText(row.type),
          symbol = asText(row.symbol, 60),
          asOf = asDate(row.as_of);
        if (!name || !["stock", "mutual_fund"].includes(type))
          return fail(400, "Investment rows need a name and stock or mutual fund type");
        const invested = asMoney(row.invested_paise),
          current = asMoney(row.value_paise);
        const key = keyFor(type, name, symbol);
        const snapshotKey = `${key}\u0000${asOf}`;
        if (seen.has(snapshotKey)) return fail(400, "Duplicate holding and folio on the same date");
        if (invested < 0 || current < 0) return fail(400, "Investment values cannot be negative");
        seen.add(snapshotKey);
        let investmentId = known.get(key);
        if (!investmentId) {
          investmentId = uid();
          known.set(key, investmentId);
          statements.push(
            env.DB.prepare(
              "INSERT INTO investments (id,owner_id,type,name,symbol,institution,created_import_id) VALUES (?,?,?,?,?,'Groww',?)",
            ).bind(investmentId, member.id, type, name, symbol || null, batch.id),
          );
        }
        snapshotIndexes.push(statements.length);
        statements.push(
          env.DB.prepare(
            "INSERT OR IGNORE INTO investment_snapshots (id,investment_id,as_of,quantity,invested_paise,value_paise,document_id,source_ref) VALUES (?,?,?,?,?,?,?,?)",
          ).bind(
            uid(),
            investmentId,
            asOf,
            asText(row.quantity, 60) || null,
            invested,
            current,
            path[1],
            `${path[1]}:${asText(row.source_ref)}`,
          ),
        );
        statements.push(
          env.DB.prepare(
            "INSERT INTO investment_presence_events(id,investment_id,document_id,as_of,present) VALUES(?,?,?,?,1) ON CONFLICT(investment_id,document_id) DO UPDATE SET as_of=MAX(investment_presence_events.as_of,excluded.as_of)",
          ).bind(uid(), investmentId, path[1], asOf),
        );
      }
      for (const id of closedIds)
        statements.push(
          env.DB.prepare(
            "INSERT INTO investment_presence_events(id,investment_id,document_id,as_of,present) VALUES(?,?,?,?,0)",
          ).bind(uid(), id, path[1], comparison.date),
        );
      statements.push(
        env.DB.prepare("UPDATE imports SET status='committed',committed_at=? WHERE id=?").bind(
          now(),
          batch.id,
        ),
      );
      statements.push(
        env.DB.prepare("UPDATE documents SET status='imported' WHERE id=?").bind(path[1]),
      );
      const results = await env.DB.batch(statements);
      imported = snapshotIndexes.reduce((sum, index) => sum + results[index].meta.changes, 0);
      duplicates = rows.length - imported;
    } else return fail(400, "This document type needs a supported review workflow");
    await audit(env, member, "commit", "import", String(batch.id), { imported, duplicates });
    return json({ imported, duplicates });
  }
  if (key === "imports" && path[1] && path[2] === "rollback" && method === "POST") {
    const batch = await env.DB.prepare(
      "SELECT * FROM imports WHERE document_id=? AND owner_id=? AND status='committed'",
    )
      .bind(path[1], member.id)
      .first<RecordRow>();
    if (!batch) return fail(404, "Committed import not found");
    if (batch.type === "fd") {
      await rollbackFixedDeposits(env, member, path[1], String(batch.id));
      await audit(env, member, "rollback", "import", String(batch.id));
      return json({ ok: true });
    }
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM investment_presence_events WHERE document_id=? AND investment_id IN (SELECT id FROM investments WHERE owner_id=?)",
      ).bind(path[1], member.id),
      env.DB.prepare(
        "DELETE FROM statement_balances WHERE document_id=? AND account_id IN (SELECT id FROM accounts WHERE owner_id=?)",
      ).bind(path[1], member.id),
      env.DB.prepare(
        "DELETE FROM transaction_import_sources WHERE document_id=? AND transaction_id IN (SELECT id FROM transactions WHERE owner_id=?)",
      ).bind(path[1], member.id),
      env.DB.prepare(
        "UPDATE transactions SET document_id=(SELECT document_id FROM transaction_import_sources WHERE transaction_id=transactions.id LIMIT 1),source_ref=(SELECT source_ref FROM transaction_import_sources WHERE transaction_id=transactions.id LIMIT 1) WHERE document_id=? AND owner_id=? AND EXISTS (SELECT 1 FROM transaction_import_sources WHERE transaction_id=transactions.id)",
      ).bind(path[1], member.id),
      env.DB.prepare(
        "DELETE FROM transactions WHERE document_id=? AND owner_id=? AND NOT EXISTS (SELECT 1 FROM transaction_import_sources WHERE transaction_id=transactions.id)",
      ).bind(path[1], member.id),
    ]);
    await env.DB.prepare(
      "DELETE FROM investment_snapshots WHERE document_id=? AND investment_id IN (SELECT id FROM investments WHERE owner_id=?)",
    )
      .bind(path[1], member.id)
      .run();
    if (batch.type === "investment") {
      const empty = await readAll<{ id: string }>(
        env.DB.prepare(
          "SELECT i.id FROM investments i WHERE i.owner_id=? AND i.created_import_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM investment_snapshots s WHERE s.investment_id=i.id) AND NOT EXISTS (SELECT 1 FROM investment_presence_events e WHERE e.investment_id=i.id)",
        ).bind(member.id),
      );
      for (const item of empty) {
        await env.DB.prepare(
          "DELETE FROM shares WHERE resource_type='investment' AND resource_id=?",
        )
          .bind(item.id)
          .run();
        await env.DB.prepare("DELETE FROM investments WHERE id=?").bind(item.id).run();
      }
    }
    if (batch.type === "account" && batch.target_id) {
      await (await accountBalanceStatement(env, String(batch.target_id))).run();
    }
    await env.DB.prepare("UPDATE imports SET status='pending',committed_at=NULL WHERE id=?")
      .bind(batch.id)
      .run();
    await env.DB.prepare("UPDATE documents SET status='uploaded' WHERE id=?").bind(path[1]).run();
    await audit(env, member, "rollback", "import", String(batch.id));
    return json({ ok: true });
  }
  return null;
}
