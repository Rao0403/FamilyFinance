import { empty, sectionHeader } from "../components/page-elements";
import { nameOf, owned } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import type { Item } from "../types/finance-record";
import { esc } from "../utils/formatters";

export function sharing() {
  const renderResourceOption = (r: Item) => /* HTML */ `
    <option value="${esc(r.resource_type)}:${esc(r.id)}">
      ${esc(r.name)} (${r.resource_type})
    </option>
  `;

  const renderMemberOption = (m: Item) => /* HTML */ `
    <option value="${esc(m.id)}">${esc(m.name)}</option>
  `;

  const renderSharingRow = (s: Item) => /* HTML */ `
    <div class="list-row">
      <span class="round-icon">♧</span>
      <div class="grow">
        <strong>${esc(nameOf(s.recipient_id))}</strong>
        <small>${esc(s.resource_type)} · ${esc(s.permission)}</small>
      </div>
      <button class="text-button danger" data-action="revoke" data-id="${esc(s.id)}">Revoke</button>
    </div>
  `;

  const resources: Item[] = [
    ...state.accounts.map((x) => ({ ...x, resource_type: "account" })),
    ...state.investments.map((x) => ({ ...x, resource_type: "investment" })),
    ...state.payments.map((x) => ({ ...x, resource_type: "payment", name: x.title })),
    ...state.documents.map((x) => ({ ...x, resource_type: "document" })),
  ].filter(owned);
  return /* HTML */ `
    ${sectionHeader(
      "ACCESS CONTROL",
      "Family sharing",
      "Your records are private until you choose who may see them.",
      state.me?.role === "admin"
        ? /* HTML */ `
            <button class="primary" data-action="invite">＋ Invite member</button>
          `
        : "",
    )}
    <div class="two-col">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Share a record</h2>
            <p>
              Account sharing includes transactions and statements. A shared document gives access
              to its entire contents.
            </p>
          </div>
        </div>
        ${
          resources.length && state.members.length > 1
            ? /* HTML */ `
                <form id="share-form" class="stack-form">
                  <label>
                    Record
                    <select name="resource" required>
                      ${resources.map(renderResourceOption).join("")}
                    </select>
                  </label>
                  <label>
                    Family member
                    <select name="recipient_id" required>
                      ${state.members
                        .filter((m) => m.id !== state.me?.id)
                        .map(renderMemberOption)
                        .join("")}
                    </select>
                  </label>
                  <label>
                    Permission
                    <select name="permission">
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                  </label>
                  <button class="primary" type="submit">Grant access</button>
                </form>
              `
            : empty("♧", "Nothing to share yet", "Add a record or invite another member.")
        }
      </section>
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Access you've granted</h2>
            <p>You can revoke access at any time</p>
          </div>
        </div>
        ${
          state.shares.length
            ? state.shares.map(renderSharingRow).join("")
            : empty("♧", "No access granted", "Your financial records are visible only to you.")
        }
      </section>
    </div>
  `;
}
