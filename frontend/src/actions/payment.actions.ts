import type { Item } from "../types/finance-record";
import { post } from "../api/finance-api";
import { field, value } from "../components/form-fields";
import { openModal } from "../components/modal";
import { state } from "../state/finance-state";
import type { RefreshApplication } from "../types/finance-record";
import { dateLabel, esc, money, paise } from "../utils/formatters";

export async function handlePaymentAction(
  type: string,
  id: string | undefined,
  load: RefreshApplication,
) {
  const renderMatchingTransactionOption = (t: Item) => /* HTML */ `
    <option value="${esc(t.id)}">
      ${dateLabel(t.date)} · ${esc(t.description)} · ${money(Math.abs(t.amount_paise))}
    </option>
  `;

  const modal = (
    title: string,
    html: string,
    onSubmit?: (form: HTMLFormElement) => Promise<void>,
  ) => openModal(title, html, onSubmit, load);
  if (type === "payment")
    return modal(
      "Add payment",
      /* HTML */ `
        ${field("Payment name", "title")}${field("Amount (₹)", "amount", "number", true, 'step="0.01"')}${field("Next due date", "next_due_date", "date")}
        <label>
          Repeats
          <select name="frequency">
            <option value="once">Once</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        ${field("Remind me days before", "remind_days", "number", true, 'min="0" max="30" value="3"')}
        <div class="checkboxes">
          <label>
            <input name="email_enabled" type="checkbox" checked />
            Email
          </label>
        </div>
      `,
      async (f) => {
        const fd = new FormData(f);
        await post("payments", {
          title: value(f, "title"),
          amount_paise: paise(value(f, "amount")),
          next_due_date: value(f, "next_due_date"),
          frequency: value(f, "frequency"),
          remind_days: Number(value(f, "remind_days")),
          email_enabled: fd.has("email_enabled"),
        });
      },
    );
  if (type === "paid" && id) {
    const payment = state.payments.find((p) => p.id === id);
    if (!payment) throw new Error("Payment not found");
    const matches = state.transactions.filter(
      (t) => t.owner_id === payment.owner_id && t.amount_paise === -payment.amount_paise,
    );
    return modal(
      "Confirm payment",
      /* HTML */ `
        <p>
          Confirm that ${esc(payment.title)} was paid. You can link a matching transaction for
          reference.
        </p>
        <label>
          Matching transaction
          <select name="transaction_id">
            <option value="">No linked transaction</option>
            ${matches.map(renderMatchingTransactionOption).join("")}
          </select>
        </label>
      `,
      async (f) => {
        await post(`payments/${id}/paid`, { transaction_id: value(f, "transaction_id") || null });
      },
    );
  }
}
