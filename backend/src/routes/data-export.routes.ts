import { readAll } from "../lib/database";
import { now } from "../lib/identifiers";
import { audit } from "../services/audit-log";
import type { RouteContext } from "../types/route-context";

export async function handleDataExportRoutes(context: RouteContext): Promise<Response | null> {
  const { env, member, method, key } = context;
  if (key === "export" && method === "GET") {
    const accounts = await readAll(
      env.DB.prepare("SELECT * FROM accounts WHERE owner_id=?").bind(member.id),
    );
    const transactions = await readAll(
      env.DB.prepare("SELECT * FROM transactions WHERE owner_id=?").bind(member.id),
    );
    const statementBalances = await readAll(
      env.DB.prepare(
        "SELECT * FROM statement_balances WHERE account_id IN (SELECT id FROM accounts WHERE owner_id=?)",
      ).bind(member.id),
    );
    const transactionImportSources = await readAll(
      env.DB.prepare(
        "SELECT * FROM transaction_import_sources WHERE transaction_id IN (SELECT id FROM transactions WHERE owner_id=?)",
      ).bind(member.id),
    );
    const investments = await readAll(
      env.DB.prepare("SELECT * FROM investments WHERE owner_id=?").bind(member.id),
    );
    const investmentIds = investments.map((x) => String(x.id));
    const investmentPresence = investmentIds.length
      ? await readAll(
          env.DB.prepare(
            `SELECT * FROM investment_presence_events WHERE investment_id IN (${investmentIds.map(() => "?").join(",")})`,
          ).bind(...investmentIds),
        )
      : [];
    const snapshots = investmentIds.length
      ? await readAll(
          env.DB.prepare(
            `SELECT * FROM investment_snapshots WHERE investment_id IN (${investmentIds.map(() => "?").join(",")})`,
          ).bind(...investmentIds),
        )
      : [];
    const fixedDepositObservations = investmentIds.length
      ? await readAll(
          env.DB.prepare(
            `SELECT * FROM fd_report_observations WHERE investment_id IN (${investmentIds.map(() => "?").join(",")})`,
          ).bind(...investmentIds),
        )
      : [];
    const payments = await readAll(
      env.DB.prepare("SELECT * FROM payments WHERE owner_id=?").bind(member.id),
    );
    const documents = (
      await readAll(env.DB.prepare("SELECT * FROM documents WHERE owner_id=?").bind(member.id))
    ).map(({ storage_key, ...record }) => record);
    const shares = await readAll(
      env.DB.prepare("SELECT * FROM shares WHERE owner_id=?").bind(member.id),
    );
    const familyLedger = await readAll(
      env.DB.prepare("SELECT * FROM family_ledger WHERE sender_id=? OR recipient_id=?").bind(
        member.id,
        member.id,
      ),
    );
    const familyLedgerProposals = await readAll(
      env.DB.prepare(
        "SELECT * FROM family_ledger_proposals WHERE proposer_id=? OR approver_id=?",
      ).bind(member.id, member.id),
    );
    const familyLedgerLinks = await readAll(
      env.DB.prepare("SELECT * FROM family_ledger_transaction_links WHERE owner_id=?").bind(
        member.id,
      ),
    );
    await audit(env, member, "export", "member", member.id);
    return new Response(
      JSON.stringify(
        {
          exported_at: now(),
          accounts,
          transactions,
          statementBalances,
          transactionImportSources,
          investments,
          investmentPresence,
          snapshots,
          fixedDepositObservations,
          payments,
          documents,
          shares,
          familyLedger,
          familyLedgerProposals,
          familyLedgerLinks,
        },
        null,
        2,
      ),
      {
        headers: {
          "content-type": "application/json",
          "content-disposition": "attachment; filename=family-finance-export.json",
          "cache-control": "private, no-store",
        },
      },
    );
  }
  return null;
}
