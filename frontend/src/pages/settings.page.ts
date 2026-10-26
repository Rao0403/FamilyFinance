import { field } from "../components/form-fields";
import { sectionHeader } from "../components/page-elements";
import { state } from "../state/finance-state";
import { esc } from "../utils/formatters";

export function settings() {
  return /* HTML */ `
    ${sectionHeader("YOUR PREFERENCES", "Settings", "Update the details used for your reminders.")}
    <div class="two-col">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Your profile</h2>
            <p>Your phone number is private to your account</p>
          </div>
        </div>
        <form id="profile-form" class="stack-form">
          ${field("Display name", "name", "text", true, `value="${esc(state.me?.name)}"`)}${field("Mobile number with 91 prefix", "phone", "tel", false, `value="${esc(state.me?.phone || "")}" placeholder="919876543210"`)}
          <label>
            Email
            <input value="${esc(state.me?.email)}" disabled />
          </label>
          <button class="primary" type="submit">Save profile</button>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Privacy</h2>
            <p>Access is always your decision</p>
          </div>
        </div>
        <div class="settings-copy">
          <p>
            Your records are private unless you share them. An administrator can invite members and
            manage app settings but cannot see your finances without your permission.
          </p>
          <p>
            Sharing a bank account includes its transactions and linked statements. You can revoke
            sharing on the Sharing page.
          </p>
          <p><a class="text-button" href="/api/export" download>Download my data →</a></p>
        </div>
      </section>
    </div>
  `;
}
