import type { Item } from "../types/finance-record";
import { empty, sectionHeader } from "../components/page-elements";
import { nameOf } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import { esc, money } from "../utils/formatters";

export function payments() {
  const renderPaymentRow = (p: Item) => /* HTML */ `
    <div class="payment-row">
      <div class="date-box">
        <strong>${esc(p.next_due_date.slice(8))}</strong>
        <small>
          ${new Date(`${p.next_due_date}T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })}
        </small>
      </div>
      <div class="grow">
        <strong>${esc(p.title)}</strong>
        <small>
          ${esc(p.frequency)} · ${esc(nameOf(p.owner_id))} ·
          ${p.email_enabled ? "Email reminder" : "Reminders off"}
        </small>
      </div>
      <div class="payment-end">
        <strong>${money(p.amount_paise)}</strong>
        ${
          p.can_edit && p.active
            ? /* HTML */ `
                <button class="text-button" data-action="paid" data-id="${esc(p.id)}">
                  Mark paid
                </button>
              `
            : ""
        }
      </div>
    </div>
  `;

  const list = [...state.payments].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  return /* HTML */ `
    ${sectionHeader(
      "BILLS & DUES",
      "Upcoming payments",
      "Know what is due and choose how to be reminded.",
      /* HTML */ `
        <button class="primary" data-action="payment">＋ Add payment</button>
      `,
    )}
    <div class="notice subtle">
      <span>✉</span>
      <div>
        <strong>Reminder delivery</strong>
        <p>
          Email sending requires provider credentials and sender setup. Payment tracking works
          independently.
        </p>
      </div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Payment schedule</h2>
          <p>All visible payments</p>
        </div>
      </div>
      ${
        list.length
          ? list.map(renderPaymentRow).join("")
          : empty("◷", "No payments scheduled", "Add a payment to plan ahead.")
      }
    </section>
  `;
}
