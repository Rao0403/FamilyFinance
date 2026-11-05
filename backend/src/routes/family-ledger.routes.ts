import { readAll } from "../lib/database";
import { body, fail, json } from "../lib/http";
import { uid } from "../lib/identifiers";
import { asDate, asMoney, asText } from "../lib/validation";
import { audit } from "../services/audit-log";
import type { RouteContext } from "../types/route-context";

type Entry = {
  id: string;
  sender_id: string;
  recipient_id: string;
  date: string;
  amount_paise: number;
  kind: string;
  note: string;
  loan_id: string | null;
  deleted: number;
};
type Proposal = {
  id: string;
  entry_id: string;
  proposer_id: string;
  approver_id: string;
  action: string;
  payload: string;
  status: string;
};

export async function handleFamilyLedgerRoutes({
  request,
  env,
  member,
  method,
  path,
}: RouteContext): Promise<Response | null> {
  if (method === "GET" && !path[1]) {
    const entries = await readAll(
      env.DB.prepare(
        "SELECT * FROM family_ledger WHERE deleted=0 ORDER BY date DESC, created_at DESC",
      ),
    );
    const proposals = await readAll(
      env.DB.prepare(
        "SELECT * FROM family_ledger_proposals WHERE status='pending' AND (proposer_id=? OR approver_id=?) ORDER BY created_at DESC",
      ).bind(member.id, member.id),
    );
    const links = await readAll(
      env.DB.prepare(
        "SELECT entry_id,transaction_id FROM family_ledger_transaction_links WHERE owner_id=?",
      ).bind(member.id),
    );
    return json({ entries, proposals, links });
  }
  if (method === "POST" && path[1] === "links" && path[2]) {
    const entry = await env.DB.prepare("SELECT * FROM family_ledger WHERE id=? AND deleted=0")
      .bind(path[2])
      .first<Entry>();
    if (!entry || (entry.sender_id !== member.id && entry.recipient_id !== member.id))
      return fail(404, "Entry not found");
    const data = await body(request),
      transactionId = asText(data.transaction_id);
    if (!transactionId) {
      await env.DB.prepare(
        "DELETE FROM family_ledger_transaction_links WHERE entry_id=? AND owner_id=?",
      )
        .bind(entry.id, member.id)
        .run();
      return json({ ok: true });
    }
    const transaction = await env.DB.prepare(
      "SELECT id FROM transactions WHERE id=? AND owner_id=?",
    )
      .bind(transactionId, member.id)
      .first();
    if (!transaction) return fail(400, "Select one of your own transactions");
    try {
      await env.DB.prepare(
        "INSERT INTO family_ledger_transaction_links(entry_id,owner_id,transaction_id) VALUES(?,?,?) ON CONFLICT(entry_id,owner_id) DO UPDATE SET transaction_id=excluded.transaction_id",
      )
        .bind(entry.id, member.id, transactionId)
        .run();
    } catch {
      return fail(409, "That transaction is already linked to another family entry");
    }
    return json({ ok: true });
  }
  if (method === "POST" && path[1] === "proposals" && !path[2]) {
    const data = await body(request);
    const action = asText(data.action) || "create";
    if (!["create", "edit", "delete"].includes(action)) return fail(400, "Invalid action");
    const old =
      action === "create"
        ? null
        : await env.DB.prepare("SELECT * FROM family_ledger WHERE id=? AND deleted=0")
            .bind(asText(data.entry_id))
            .first<Entry>();
    if (
      action !== "create" &&
      (!old || (old.sender_id !== member.id && old.recipient_id !== member.id))
    )
      return fail(403, "Only participants can propose a change");
    const sender = old?.sender_id || asText(data.sender_id),
      recipient = old?.recipient_id || asText(data.recipient_id);
    if (
      !sender ||
      !recipient ||
      sender === recipient ||
      (sender !== member.id && recipient !== member.id)
    )
      return fail(400, "Select two different participants including yourself");
    const other = sender === member.id ? recipient : sender;
    if (
      !(await env.DB.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(other).first())
    )
      return fail(400, "Other participant must be active");
    const kind = action === "delete" ? old!.kind : asText(data.kind);
    if (
      ![
        "pocket_money",
        "expense_contribution",
        "gift",
        "other",
        "loan",
        "opening_loan",
        "repayment",
      ].includes(kind)
    )
      return fail(400, "Invalid transfer type");
    const amount = action === "delete" ? old!.amount_paise : asMoney(data.amount_paise);
    if (amount <= 0) return fail(400, "Amount must be positive");
    const date = action === "delete" ? old!.date : asDate(data.date);
    const loanId =
      kind === "repayment" ? asText(action === "delete" ? old!.loan_id : data.loan_id) : null;
    if (kind === "repayment" && !loanId) return fail(400, "Select a loan to repay");
    const payload = {
      sender_id: sender,
      recipient_id: recipient,
      date,
      amount_paise: amount,
      kind,
      loan_id: loanId,
      note: action === "delete" ? old!.note : asText(data.note, 300),
    };
    const id = uid(),
      entryId = old?.id || uid();
    try {
      await env.DB.prepare(
        "INSERT INTO family_ledger_proposals(id,entry_id,proposer_id,approver_id,action,payload) VALUES(?,?,?,?,?,?)",
      )
        .bind(id, entryId, member.id, other, action, JSON.stringify(payload))
        .run();
    } catch {
      return fail(409, "A change is already awaiting confirmation");
    }
    await audit(env, member, "propose", "family_ledger", entryId);
    return json({ id }, 201);
  }
  if (method === "POST" && path[1] === "proposals" && path[2]) {
    const proposal = await env.DB.prepare("SELECT * FROM family_ledger_proposals WHERE id=?")
      .bind(path[2])
      .first<Proposal>();
    if (!proposal || (proposal.approver_id !== member.id && proposal.proposer_id !== member.id))
      return fail(404, "Proposal not found");
    const data = await body(request);
    const status = asText(data.status);
    if (status !== "confirmed" && status !== "rejected") return fail(400, "Invalid response");
    if (status === "confirmed" && proposal.approver_id !== member.id)
      return fail(403, "Only the other participant can confirm");
    try {
      const result = await env.DB.prepare(
        "UPDATE family_ledger_proposals SET status=? WHERE id=? AND (approver_id=? OR (?='rejected' AND proposer_id=?)) AND status='pending'",
      )
        .bind(status, proposal.id, member.id, status, member.id)
        .run();
      if (!result.meta.changes) return fail(409, "This proposal has already been resolved");
    } catch {
      return fail(409, "The loan or repayment has changed. Review the balance and try again.");
    }
    await audit(env, member, status, "family_ledger", proposal.entry_id);
    return json({ ok: true });
  }
  return null;
}
