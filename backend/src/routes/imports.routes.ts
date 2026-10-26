import { readAll } from "../lib/database";
import { body, fail, json } from "../lib/http";
import { now, uid } from "../lib/identifiers";
import { asDate, asMoney, asText } from "../lib/validation";
import { accountBalanceStatement } from "../services/account-balances";
import { audit } from "../services/audit-log";
import type { RecordRow } from "../types/records";
import type { RouteContext } from "../types/route-context";

export async function handleImportsRoutes(context: RouteContext): Promise<Response | null> {
  const { request, env, member, path, method, key } = context;
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
    let imported = 0,
      duplicates = 0;
    if (batch.type === "account" && batch.target_id) {
      const statements: D1PreparedStatement[] = [];
      for (const row of rows) {
        const date = asDate(row.date),
          amount = asMoney(row.amount_paise),
          description = asText(row.description, 500);
        const fingerprint = `${date}|${amount}|${description}|${row.balance_paise ?? ""}`;
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
      }
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
      imported = results
        .slice(0, rows.length)
        .reduce((sum, result) => sum + result.meta.changes, 0);
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
      const keyFor = (type: string, name: string, symbol: string) =>
        `${type}\u0000${name.toLowerCase()}\u0000${symbol}`;
      const known = new Map(
        existing.map((item) => [keyFor(item.type, item.name, item.symbol || ""), item.id]),
      );
      const statements: D1PreparedStatement[] = [],
        snapshotIndexes: number[] = [];
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
      }
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
    await env.DB.prepare("DELETE FROM transactions WHERE document_id=? AND owner_id=?")
      .bind(path[1], member.id)
      .run();
    await env.DB.prepare(
      "DELETE FROM investment_snapshots WHERE document_id=? AND investment_id IN (SELECT id FROM investments WHERE owner_id=?)",
    )
      .bind(path[1], member.id)
      .run();
    if (batch.type === "investment") {
      const empty = await readAll<{ id: string }>(
        env.DB.prepare(
          "SELECT i.id FROM investments i WHERE i.owner_id=? AND i.created_import_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM investment_snapshots s WHERE s.investment_id=i.id)",
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
