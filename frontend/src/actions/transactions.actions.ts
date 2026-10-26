import { api, post } from "../api/finance-api";
import { field, value } from "../components/form-fields";
import { openModal } from "../components/modal";
import { owned } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import type { Item, RefreshApplication } from "../types/finance-record";
import { esc, paise, today } from "../utils/formatters";

export async function handleTransactionAction(
  type: string,
  id: string | undefined,
  load: RefreshApplication,
) {
  const renderAccountOption = (a: Item) => /* HTML */ `
    <option value="${esc(a.id)}">${esc(a.name)}</option>
  `;
  const renderTransactionKindOption = (k: string, selectedKind: string) => /* HTML */ `
    <option value="${k}" ${k === selectedKind ? "selected" : ""}>${k}</option>
  `;
  const modal = (
    title: string,
    html: string,
    onSubmit?: (form: HTMLFormElement) => Promise<void>,
  ) => openModal(title, html, onSubmit, load);
  if (type === "transaction") {
    const mine = state.accounts.filter(owned);
    if (!mine.length) return window.alert("Add your account first.");
    return modal(
      "Add transaction",
      /* HTML */ `
        <label>
          Account
          <select name="account_id">
            ${mine.map(renderAccountOption).join("")}
          </select>
        </label>
        ${field("Date", "date", "date", true, `value="${today()}"`)}${field("Description", "description")}${field("Amount (₹, negative for spending)", "amount", "number", true, 'step="0.01"')}${field("Category", "category", "text", true, 'placeholder="e.g. Groceries"')}
        <label>
          Type
          <select name="kind">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
            <option value="investment">Investment contribution</option>
            <option value="refund">Refund</option>
          </select>
        </label>
      `,
      async (f) => {
        await post("transactions", {
          account_id: value(f, "account_id"),
          date: value(f, "date"),
          description: value(f, "description"),
          amount_paise: paise(value(f, "amount")),
          category: value(f, "category"),
          kind: value(f, "kind"),
        });
      },
    );
  }
  if (type === "transaction-edit" && id) {
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) throw new Error("Transaction not found");
    return modal(
      "Edit transaction",
      /* HTML */ `
        ${field("Date", "date", "date", true, `value="${esc(tx.date)}"`)}${field("Description", "description", "text", true, `value="${esc(tx.description)}"`)}${field("Amount (₹)", "amount", "number", true, `step="0.01" value="${(tx.amount_paise / 100).toFixed(2)}"`)}${field("Category", "category", "text", true, `value="${esc(tx.category)}"`)}
        <label>
          Type
          <select name="kind">
            ${["expense", "income", "transfer", "investment", "refund", "fee"].map((k) => renderTransactionKindOption(k, tx.kind)).join("")}
          </select>
        </label>
      `,
      async (f) => {
        await api(`transactions/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            date: value(f, "date"),
            description: value(f, "description"),
            amount_paise: paise(value(f, "amount")),
            category: value(f, "category"),
            kind: value(f, "kind"),
          }),
        });
      },
    );
  }
}
