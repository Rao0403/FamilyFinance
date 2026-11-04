import { post } from "../api/finance-api";
import { field, value } from "../components/form-fields";
import { openModal } from "../components/modal";
import { ledgerBalances } from "../pages/family-ledger.page";
import { nameOf } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import type { RefreshApplication } from "../types/finance-record";
import { esc, money, paise, today } from "../utils/formatters";

export async function handleFamilyLedgerAction(type: string, id: string | undefined, load: RefreshApplication) {
  if ((type === "ledger-confirm" || type === "ledger-reject") && id) {
    await post(`family-ledger/proposals/${id}`, { status: type === "ledger-confirm" ? "confirmed" : "rejected" });
    await load();
    return;
  }
  const old = state.ledger.entries.find((e) => e.id === id);
  if (type === "ledger-link" && old) {
    const transactions = state.transactions.filter((t) => t.owner_id === state.me?.id);
    const linked = state.ledger.links.find((link) => link.entry_id === old.id);
    return openModal("Link your transaction", `<p>This link and transaction details remain private to you. It does not create another transfer.</p><label>Transaction <select name="transaction_id"><option value="">No link</option>${transactions.map((t) => `<option value="${esc(t.id)}" ${linked?.transaction_id === t.id ? "selected" : ""}>${esc(t.date)} · ${esc(t.description)} · ${money(t.amount_paise)}</option>`).join("")}</select></label>`, async (f) => { await post(`family-ledger/links/${old.id}`, { transaction_id: value(f, "transaction_id") }); }, load);
  }
  if (type === "ledger-delete" && old) {
    if (!window.confirm("Propose removing this confirmed entry? The other participant must agree.")) return;
    await post("family-ledger/proposals", { action: "delete", entry_id: old.id });
    await load();
    return;
  }
  const others = state.members.filter((m) => m.id !== state.me?.id);
  if (!others.length) return window.alert("Invite another family member first.");
  const kinds = ["pocket_money", "expense_contribution", "gift", "other", "loan", "opening_loan", "repayment"];
  const loans = ledgerBalances(state.ledger.entries).filter((l) => l.sender_id === state.me?.id || l.recipient_id === state.me?.id);
  if (old?.loan_id && !loans.some((l) => l.id === old.loan_id)) {
    const loan = state.ledger.entries.find((entry) => entry.id === old.loan_id);
    if (loan) loans.push({ ...loan, remaining: 0 });
  }
  return openModal(old ? "Propose a correction" : "Record a family transfer", `<p>The other person must confirm. Confirmed details are visible to the whole family.</p>
    ${old ? `<p>${esc(nameOf(old.sender_id))} → ${esc(nameOf(old.recipient_id))}</p>` : `<label>Other family member <select name="other">${others.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</select></label><label>Direction <select name="direction"><option value="sent">I sent money</option><option value="received">I received money</option></select></label>`}
    ${field("Date", "date", "date", true, `value="${esc(old?.date || today())}"`)}${field("Amount (₹)", "amount", "number", true, `min="0.01" step="0.01" value="${old ? (old.amount_paise / 100).toFixed(2) : ""}"`)}
    <label>Type <select name="kind">${kinds.map((kind) => `<option value="${kind}" ${kind === old?.kind ? "selected" : ""}>${esc(kind.replaceAll("_", " "))}</option>`).join("")}</select></label>
    <label>Loan being repaid (for repayments) <select name="loan_id"><option value="">Select loan</option>${loans.map((l) => `<option value="${esc(l.id)}" ${l.id === old?.loan_id ? "selected" : ""}>${esc(nameOf(l.recipient_id))} owes ${esc(nameOf(l.sender_id))} · ${money(l.remaining)} remaining</option>`).join("")}</select></label>
    ${field("Note (visible to family)", "note", "text", false, `value="${esc(old?.note || "")}"`)}<p>For an existing debt, select Opening loan and enter the amount still owed. It won't count as a transfer on this date.</p>`, async (f) => {
      const other = value(f, "other"), sent = value(f, "direction") === "sent";
      await post("family-ledger/proposals", { action: old ? "edit" : "create", entry_id: old?.id, sender_id: old?.sender_id || (sent ? state.me?.id : other), recipient_id: old?.recipient_id || (sent ? other : state.me?.id), date: value(f, "date"), amount_paise: paise(value(f, "amount")), kind: value(f, "kind"), loan_id: value(f, "loan_id"), note: value(f, "note") });
    }, load);
}
