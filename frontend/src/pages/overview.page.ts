import type { Item } from "../types/finance-record";
import { card, empty, sectionHeader } from "../components/page-elements";
import { nameOf } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import { dateLabel, esc, money, today } from "../utils/formatters";

export function overview() {
  const renderUpcomingPayment = (p: Item) => /* HTML */ `
    <div class="list-row">
      <span class="round-icon">◷</span>
      <div class="grow">
        <strong>${esc(p.title)}</strong>
        <small>${dateLabel(p.next_due_date)} · ${esc(nameOf(p.owner_id))}</small>
      </div>
      <strong>${money(p.amount_paise)}</strong>
    </div>
  `;

  const renderRecentTransaction = (t: Item) => /* HTML */ `
    <div class="list-row">
      <span class="round-icon ${t.amount_paise < 0 ? "out" : "in"}">
        ${t.amount_paise < 0 ? "↗" : "↙"}
      </span>
      <div class="grow">
        <strong>${esc(t.description)}</strong>
        <small>${dateLabel(t.date)} · ${esc(t.category)}</small>
      </div>
      <strong class="${t.amount_paise < 0 ? "negative" : "positive"}">
        ${t.amount_paise < 0 ? "−" : "+"}${money(Math.abs(t.amount_paise))}
      </strong>
    </div>
  `;

  const d = state.dashboard || {};
  const total = (d.bank_paise || 0) + (d.investment_paise || 0);
  const upcoming = state.payments
    .filter((p) => p.active && p.next_due_date >= today())
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
    .slice(0, 4);
  const recent = state.transactions.slice(0, 5);
  return /* HTML */ `
    ${sectionHeader(
      "YOUR FINANCIAL PICTURE",
      "Good to see you, " + esc(state.me?.name?.split(" ")[0] || "there") + ".",
      "Your personal records and anything family members have shared with you.",
      /* HTML */ `
        <button class="primary" data-action="upload">＋ Import document</button>
      `,
    )}
    <div class="notice">
      <span>◉</span>
      <div>
        <strong>Visible to you</strong>
        <p>
          Totals include only records you own or can view. Values reflect the most recent uploaded
          documents.
        </p>
      </div>
    </div>
    <div class="metrics">
      ${card("Visible net worth", money(total), "Bank balances + investment values", "↗", "hero")}${card("Bank balances", money(d.bank_paise), `${state.accounts.length} visible account${state.accounts.length === 1 ? "" : "s"}`, "▤")}${card("Investments", money(d.investment_paise), `${state.investments.length} visible holding${state.investments.length === 1 ? "" : "s"}`, "◈")}${card("Spent this month", money(d.spending_paise), d.month || "Current month", "↘")}
    </div>
    <div class="two-col">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Upcoming payments</h2>
            <p>Stay ahead of what’s due</p>
          </div>
          <button class="text-button" data-tab="Payments">View all →</button>
        </div>
        ${
          upcoming.length
            ? upcoming.map(renderUpcomingPayment).join("")
            : empty("◷", "No upcoming payments", "Add a bill or recurring payment to see it here.")
        }
      </section>
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Recent activity</h2>
            <p>Latest visible transactions</p>
          </div>
          <button class="text-button" data-tab="Accounts">View all →</button>
        </div>
        ${
          recent.length
            ? recent.map(renderRecentTransaction).join("")
            : empty("↔", "No transactions yet", "Import an Indian Bank PDF or add a transaction.")
        }
      </section>
    </div>
  `;
}
