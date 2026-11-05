import { empty, sectionHeader } from "../components/page-elements";
import { nameOf } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import { dateLabel, esc, money, today } from "../utils/formatters";
import type { Item } from "../types/finance-record";

const title = (kind: string) => kind.replaceAll("_", " ");
export function ledgerBalances(entries: Item[]): (Item & { remaining: number })[] {
  return entries
    .filter((e) => e.kind === "loan" || e.kind === "opening_loan")
    .map((loan) => ({
      ...loan,
      remaining:
        loan.amount_paise -
        entries
          .filter((e) => e.kind === "repayment" && e.loan_id === loan.id)
          .reduce((sum, e) => sum + e.amount_paise, 0),
    }))
    .filter((loan) => loan.remaining > 0);
}
export function familyLedger() {
  const entries = state.ledger.entries;
  const pending = state.ledger.proposals;
  const balances = ledgerBalances(entries);
  const row = (e: Item) =>
    `<tr data-ledger-id="${esc(e.id)}"><td>${dateLabel(e.date)}</td><td>${esc(nameOf(e.sender_id))} → ${esc(nameOf(e.recipient_id))}</td><td>${esc(title(e.kind))}</td><td>${money(e.amount_paise)}</td><td>${esc(e.note)}</td><td>${e.sender_id === state.me?.id || e.recipient_id === state.me?.id ? `<button class="text-button" data-action="ledger-edit" data-id="${esc(e.id)}">Propose edit</button><button class="text-button" data-action="ledger-delete" data-id="${esc(e.id)}">Propose removal</button><button class="text-button" data-action="ledger-link" data-id="${esc(e.id)}">${state.ledger.links.some((link) => link.entry_id === e.id) ? "Change private link" : "Link my transaction"}</button>` : ""}</td></tr>`;
  return `${sectionHeader("FAMILY", "Family ledger", "Confirmed entries are visible to the family. Pending proposals are private to their participants.", '<button class="primary" data-action="ledger-add">＋ Record transfer or loan</button>')}
  <div class="ledger-stack"><section class="panel ledger-panel"><div class="panel-head"><div><h2>Awaiting confirmation</h2><p>Changes take effect only after the other participant agrees.</p></div></div>${
    pending.length
      ? pending
          .map((p) => {
            const e = JSON.parse(p.payload);
            return `<div class="list-row ledger-proposal"><div class="grow"><strong>${esc(p.action)} · ${esc(nameOf(e.sender_id))} → ${esc(nameOf(e.recipient_id))} · ${money(e.amount_paise)}</strong><small>${dateLabel(e.date)} · ${esc(title(e.kind))} · ${esc(e.note)} · ${p.approver_id === state.me?.id ? "Your confirmation needed" : "Waiting for the other person"}</small></div>${p.approver_id === state.me?.id ? `<button class="primary" data-action="ledger-confirm" data-id="${esc(p.id)}">Confirm</button><button class="secondary" data-action="ledger-reject" data-id="${esc(p.id)}">Reject</button>` : `<button class="secondary" data-action="ledger-reject" data-id="${esc(p.id)}">Cancel proposal</button>`}</div>`;
          })
          .join("")
      : empty(
          "◷",
          "No pending proposals",
          "New transfers and changes need both participants' agreement.",
        )
  }</section>
  <section class="panel ledger-panel"><div class="panel-head"><div><h2>Outstanding family loans</h2><p>Separate from net worth.</p></div></div>${balances.length ? balances.map((b) => `<div class="list-row"><div class="grow"><strong>${esc(nameOf(b.recipient_id))} owes ${esc(nameOf(b.sender_id))}</strong><small>Loan from ${dateLabel(b.date)}</small></div><strong>${money(b.remaining)}</strong></div>`).join("") : '<p class="ledger-empty-note">No outstanding confirmed loans.</p>'}</section>
  <section class="panel table-panel ledger-panel"><div class="panel-head"><div><h2>Confirmed family transfers</h2><p>Visible to all family members</p></div></div><div class="ledger-filter"><label for="ledger-month">Month</label><input id="ledger-month" type="month" value="${today().slice(0, 7)}"></div><div id="ledger-totals" class="ledger-totals" aria-live="polite"></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>From → To</th><th>Type</th><th>Amount</th><th>Note</th><th></th></tr></thead><tbody>${entries.map(row).join("")}</tbody></table></div></section></div>`;
}
