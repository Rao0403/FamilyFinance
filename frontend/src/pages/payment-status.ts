import { app } from "../app/app-root";
import { state } from "../state/finance-state";
import { dateLabel, today } from "../utils/formatters";

export function decoratePaymentStatuses() {
  if (state.tab === "Payments") {
    const ordered = [...state.payments].sort((a, b) =>
      a.next_due_date.localeCompare(b.next_due_date),
    );
    app.querySelectorAll<HTMLElement>(".payment-row").forEach((row, index) => {
      const payment = ordered[index],
        detail = document.createElement("small");
      detail.textContent = payment.active
        ? payment.next_due_date < today()
          ? "Overdue"
          : "Scheduled"
        : "Completed";
      if (payment.last_paid)
        detail.textContent += ` · Last paid ${dateLabel(payment.last_paid.due_date)}${payment.last_paid.transaction_id ? " · transaction linked" : ""}`;
      row.querySelector(".grow")?.append(detail);
    });
  }
}
