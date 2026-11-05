import { readAll } from "../lib/database";
import { now, uid } from "../lib/identifiers";
import { asDate, asMoney, asText } from "../lib/validation";
import type { Env } from "../types/environment";
import type { Member, RecordRow } from "../types/records";

function updateFromLatest(env: Env, investmentId: string): D1PreparedStatement {
  const latest =
    "FROM fd_report_observations WHERE investment_id=investments.id ORDER BY report_date DESC, rowid DESC LIMIT 1";
  return env.DB.prepare(
    `UPDATE investments SET
    principal_paise=(SELECT principal_paise ${latest}),
    rate_bps=(SELECT rate_bps ${latest}),
    start_date=(SELECT start_date ${latest}),
    maturity_date=(SELECT maturity_date ${latest}),
    maturity_amount_paise=(SELECT maturity_amount_paise ${latest}),
    fd_report_date=(SELECT report_date ${latest})
    WHERE id=? AND EXISTS (SELECT 1 FROM fd_report_observations WHERE investment_id=?)`,
  ).bind(investmentId, investmentId);
}

export async function commitFixedDeposits(
  env: Env,
  member: Member,
  documentId: string,
  batchId: string,
  rows: RecordRow[],
  missingIds: string[],
  reportDate: string,
) {
  const existing = await readAll<{ id: string; symbol: string }>(
    env.DB.prepare(
      "SELECT id,symbol FROM investments WHERE owner_id=? AND type='fd' AND symbol LIKE 'fd:%'",
    ).bind(member.id),
  );
  const known = new Map(existing.map((item) => [item.symbol, item.id]));
  const seen = new Set<string>();
  const statements: D1PreparedStatement[] = [];
  for (const row of rows) {
    const identity = asText(row.identity_hash, 64),
      suffix = asText(row.account_suffix, 4);
    if (!/^[a-f0-9]{64}$/.test(identity) || !/^\d{4}$/.test(suffix))
      throw new Error("Invalid fixed deposit reference");
    const symbol = `fd:${identity}`;
    if (seen.has(symbol)) throw new Error("Duplicate fixed deposit in this report");
    seen.add(symbol);
    const start = asDate(row.start_date),
      date = asDate(row.report_date),
      principal = asMoney(row.principal_paise);
    const rate = row.rate_bps == null ? null : asMoney(row.rate_bps);
    const maturity = row.maturity_date ? asDate(row.maturity_date) : null;
    const maturityAmount =
      row.maturity_amount_paise == null ? null : asMoney(row.maturity_amount_paise);
    if (
      principal <= 0 ||
      date < start ||
      (rate != null && (rate < 0 || rate > 10000)) ||
      (maturity && maturity < start) ||
      (maturityAmount != null && maturityAmount < 0)
    )
      throw new Error("Invalid fixed deposit values");
    let id = known.get(symbol);
    if (!id) {
      id = uid();
      known.set(symbol, id);
      statements.push(
        env.DB.prepare(
          "INSERT INTO investments (id,owner_id,type,name,symbol,institution,principal_paise,start_date,created_import_id) VALUES (?,?,'fd',?,?,'Indian Bank',?,?,?)",
        ).bind(id, member.id, `Fixed deposit ••••${suffix}`, symbol, principal, start, batchId),
      );
    }
    statements.push(
      env.DB.prepare(
        "INSERT INTO fd_report_observations (id,investment_id,document_id,report_date,start_date,principal_paise,rate_bps,maturity_date,maturity_amount_paise,source_ref) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        uid(),
        id,
        documentId,
        date,
        start,
        principal,
        rate,
        maturity,
        maturityAmount,
        asText(row.source_ref) || null,
      ),
    );
    statements.push(updateFromLatest(env, id));
    statements.push(
      env.DB.prepare(
        "INSERT INTO investment_presence_events(id,investment_id,document_id,as_of,present) VALUES(?,?,?,?,1)",
      ).bind(uid(), id, documentId, date),
    );
  }
  for (const id of missingIds)
    statements.push(
      env.DB.prepare(
        "INSERT INTO investment_presence_events(id,investment_id,document_id,as_of,present) VALUES(?,?,?,?,0)",
      ).bind(uid(), id, documentId, reportDate),
    );
  statements.push(
    env.DB.prepare("UPDATE imports SET status='committed',committed_at=? WHERE id=?").bind(
      now(),
      batchId,
    ),
  );
  statements.push(
    env.DB.prepare("UPDATE documents SET status='imported' WHERE id=?").bind(documentId),
  );
  await env.DB.batch(statements);
  return rows.length;
}

export async function rollbackFixedDeposits(
  env: Env,
  member: Member,
  documentId: string,
  batchId: string,
) {
  const affected = await readAll<{ id: string }>(
    env.DB.prepare(
      "SELECT DISTINCT i.id FROM investments i JOIN fd_report_observations o ON o.investment_id=i.id WHERE o.document_id=? AND i.owner_id=?",
    ).bind(documentId, member.id),
  );
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "DELETE FROM investment_presence_events WHERE document_id=? AND investment_id IN (SELECT id FROM investments WHERE owner_id=?)",
    ).bind(documentId, member.id),
    env.DB.prepare(
      "DELETE FROM fd_report_observations WHERE document_id=? AND investment_id IN (SELECT id FROM investments WHERE owner_id=?)",
    ).bind(documentId, member.id),
  ];
  for (const item of affected) {
    statements.push(updateFromLatest(env, item.id));
    const empty =
      "NOT EXISTS (SELECT 1 FROM fd_report_observations WHERE investment_id=investments.id) AND NOT EXISTS (SELECT 1 FROM investment_snapshots WHERE investment_id=investments.id) AND NOT EXISTS (SELECT 1 FROM investment_presence_events WHERE investment_id=investments.id)";
    statements.push(
      env.DB.prepare(
        `DELETE FROM shares WHERE resource_type='investment' AND resource_id IN (SELECT id FROM investments WHERE id=? AND created_import_id IS NOT NULL AND ${empty})`,
      ).bind(item.id),
    );
    statements.push(
      env.DB.prepare(
        `DELETE FROM investments WHERE id=? AND owner_id=? AND created_import_id IS NOT NULL AND ${empty}`,
      ).bind(item.id, member.id),
    );
  }
  statements.push(
    env.DB.prepare("UPDATE imports SET status='pending',committed_at=NULL WHERE id=?").bind(
      batchId,
    ),
  );
  statements.push(
    env.DB.prepare("UPDATE documents SET status='uploaded' WHERE id=?").bind(documentId),
  );
  await env.DB.batch(statements);
}
