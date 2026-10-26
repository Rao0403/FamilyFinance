import type { Item } from "../types/finance-record";
import { empty, pill, sectionHeader } from "../components/page-elements";
import { nameOf, owned } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import { dateLabel, esc, money } from "../utils/formatters";

export function accounts() {
  const renderAccountCard = (a: Item) => /* HTML */ `
    <div class="account-card">
      <div class="account-top">
        <span class="round-icon">▤</span>
        ${pill(owned(a) ? "Yours" : `Shared by ${nameOf(a.owner_id)}`)}
      </div>
      <h3>${esc(a.name)}</h3>
      <small>${esc(a.institution)} ${esc(a.masked_number || "")}</small>
      <strong>${money(a.balance_paise)}</strong>
      <div class="account-bottom">
        <span>As of ${dateLabel(a.balance_as_of)}</span>
        ${
          owned(a)
            ? /* HTML */ `
                <button class="text-button" data-action="import-account" data-id="${esc(a.id)}">
                  Import statement →
                </button>
              `
            : ""
        }
      </div>
    </div>
  `;

  const renderTransactionRow = (t: Item) => /* HTML */ `
    <tr>
      <td>${dateLabel(t.date)}</td>
      <td><strong>${esc(t.description)}</strong></td>
      <td>${pill(t.category)}</td>
      <td>${esc(state.accounts.find((a) => a.id === t.account_id)?.name || "Account")}</td>
      <td class="right ${t.amount_paise < 0 ? "negative" : "positive"}">
        ${t.amount_paise < 0 ? "−" : "+"}${money(Math.abs(t.amount_paise))}
      </td>
    </tr>
  `;

  const rows = state.transactions;
  return /* HTML */ `
    ${sectionHeader(
      "CASH FLOW",
      "Accounts & transactions",
      "Track balances and understand where money goes.",
      /* HTML */ `
        <div class="head-actions">
          <button class="secondary" data-action="transaction">＋ Transaction</button>
          <button class="primary" data-action="account">＋ Add account</button>
        </div>
      `,
    )}
    <div class="account-grid">
      ${
        state.accounts.map(renderAccountCard).join("") ||
        empty(
          "▤",
          "No accounts yet",
          "Add an Indian Bank account to start tracking its statements.",
        )
      }
    </div>
    <section class="panel table-panel">
      <div class="panel-head">
        <div>
          <h2>Transactions</h2>
          <p>${rows.length} visible entries</p>
        </div>
      </div>
      ${
        rows.length
          ? /* HTML */ `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Account</th>
                      <th class="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>${rows.map(renderTransactionRow).join("")}</tbody>
                </table>
              </div>
            `
          : empty("↔", "No transactions", "Import a statement or add a transaction manually.")
      }
    </section>
  `;
}
