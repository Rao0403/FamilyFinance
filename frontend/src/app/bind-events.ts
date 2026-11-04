import { action } from "../actions/action-dispatcher";
import { api, post } from "../api/finance-api";
import { value } from "../components/form-fields";
import { canEditAccount } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import { nameOf } from "../state/finance-selectors";
import { money } from "../utils/formatters";
import type { RefreshApplication } from "../types/finance-record";
import { alertError } from "../utils/notify-error";
import { app } from "./app-root";

export function bind(load: RefreshApplication) {
  app
    .querySelectorAll<HTMLElement>("[data-action]")
    .forEach((element) =>
      element.addEventListener("click", () =>
        action(element.dataset.action!, element.dataset.id, load).catch(alertError),
      ),
    );
  if (state.tab === "Accounts")
    app.querySelectorAll<HTMLTableRowElement>("tr[data-transaction-id]").forEach((row) => {
      const tx = state.transactions.find((item) => item.id === row.dataset.transactionId);
      if (!tx || !canEditAccount(tx.account_id)) return;
      const button = document.createElement("button");
      button.className = "text-button";
      button.textContent = "Edit";
      button.addEventListener("click", () =>
        action("transaction-edit", tx.id, load).catch(alertError),
      );
      row.cells[1]?.appendChild(button);
    });
  const filters = app.querySelector<HTMLFormElement>("#transaction-filters");
  const applyFilters = () => {
    if (!filters) return;
    let count = 0;
    for (const row of app.querySelectorAll<HTMLTableRowElement>("tr[data-transaction-id]")) {
      const tx = state.transactions.find((item) => item.id === row.dataset.transactionId);
      if (!tx) continue;
      const search = value(filters, "search").trim().toLowerCase();
      const from = value(filters, "from"), to = value(filters, "to"), account = value(filters, "account"), category = value(filters, "category"), direction = value(filters, "direction"), min = value(filters, "min"), max = value(filters, "max");
      const amount = Math.abs(tx.amount_paise) / 100;
      row.hidden = !!((search && !String(tx.description).toLowerCase().includes(search)) || (from && tx.date < from) || (to && tx.date > to) || (account && tx.account_id !== account) || (category && tx.category !== category) || (direction === "in" && tx.amount_paise <= 0) || (direction === "out" && tx.amount_paise >= 0) || (min && amount < Number(min)) || (max && amount > Number(max)));
      if (!row.hidden) count++;
    }
    const label = app.querySelector<HTMLElement>("#transaction-filter-count");
    if (label) label.textContent = `${count} matching transactions`;
  };
  filters?.addEventListener("input", applyFilters);
  filters?.addEventListener("reset", () => setTimeout(applyFilters, 0));
  filters?.addEventListener("submit", (event) => event.preventDefault());
  applyFilters();
  const month = app.querySelector<HTMLInputElement>("#ledger-month");
  const renderLedgerTotals = () => {
    if (!month) return;
    const visible = state.ledger.entries.filter((entry) => !month.value || entry.date.startsWith(month.value));
    for (const row of app.querySelectorAll<HTMLTableRowElement>("tr[data-ledger-id]")) row.hidden = !visible.some((entry) => entry.id === row.dataset.ledgerId);
    const totals = state.members.map((member) => {
      const sent = visible.filter((entry) => entry.kind !== "opening_loan" && entry.sender_id === member.id).reduce((sum, entry) => sum + entry.amount_paise, 0);
      const received = visible.filter((entry) => entry.kind !== "opening_loan" && entry.recipient_id === member.id).reduce((sum, entry) => sum + entry.amount_paise, 0);
      return `${nameOf(member.id)}: sent ${money(sent)}, received ${money(received)}`;
    });
    const target = app.querySelector<HTMLElement>("#ledger-totals");
    if (target) target.textContent = totals.join(" · ");
  };
  month?.addEventListener("input", renderLedgerTotals);
  renderLedgerTotals();
  const shareForm = app.querySelector<HTMLFormElement>("#share-form");
  shareForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const [resource_type, resource_id] = value(shareForm, "resource").split(":");
      await post("shares", {
        resource_type,
        resource_id,
        recipient_id: value(shareForm, "recipient_id"),
        permission: value(shareForm, "permission"),
      });
      await load();
    } catch (error) {
      alertError(error);
    }
  });
  const profileForm = app.querySelector<HTMLFormElement>("#profile-form");
  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("me", {
        method: "PATCH",
        body: JSON.stringify({
          name: value(profileForm, "name"),
          phone: value(profileForm, "phone"),
        }),
      });
      await load();
    } catch (error) {
      alertError(error);
    }
  });
}
