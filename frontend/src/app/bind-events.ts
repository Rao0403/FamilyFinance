import { action } from "../actions/action-dispatcher";
import { api, post } from "../api/finance-api";
import { value } from "../components/form-fields";
import { canEditAccount } from "../state/finance-selectors";
import { state } from "../state/finance-state";
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
    app.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row, index) => {
      const tx = state.transactions[index];
      if (!tx || !canEditAccount(tx.account_id)) return;
      const button = document.createElement("button");
      button.className = "text-button";
      button.textContent = "Edit";
      button.addEventListener("click", () =>
        action("transaction-edit", tx.id, load).catch(alertError),
      );
      row.cells[1]?.appendChild(button);
    });
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
