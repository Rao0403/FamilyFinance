import type { Item } from "../types/finance-record";
import { empty } from "../components/page-elements";
import { state } from "../state/finance-state";
import { esc } from "../utils/formatters";

export function settingsPanels() {
  const renderMemberRow = (m: Item) => /* HTML */ `
    <div class="list-row">
      <span class="round-icon">♧</span>
      <div class="grow">
        <strong>${esc(m.name)}</strong>
        <small>${esc(m.email)}</small>
      </div>
      <button class="text-button danger" data-action="deactivate" data-id="${esc(m.id)}">
        Deactivate
      </button>
    </div>
  `;

  const adminPanel =
    state.tab === "Settings" && state.me?.role === "admin"
      ? /* HTML */ `
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>Family members</h2>
                <p>Membership does not grant access to anyone’s financial records</p>
              </div>
            </div>
            ${
              state.members
                .filter((m) => m.id !== state.me?.id)
                .map(renderMemberRow)
                .join("") || empty("♧", "No other members", "Invite members from the Sharing page.")
            }
          </section>
        `
      : "";
  const deletionPanel =
    state.tab === "Settings"
      ? /* HTML */ `
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>Delete my financial data</h2>
                <p>
                  This removes your accounts, transactions, investments, payments, shares, and
                  uploaded documents. Your family login stays active.
                </p>
              </div>
            </div>
            <button class="text-button danger" data-action="delete-data">Delete my data</button>
          </section>
        `
      : "";
  return adminPanel + deletionPanel;
}
