import { api } from "../api/finance-api";
import { shell } from "../components/app-shell";
import { accounts } from "../pages/accounts.page";
import { documentsView } from "../pages/documents.page";
import { investments } from "../pages/investments.page";
import { overview } from "../pages/overview.page";
import { decoratePaymentStatuses } from "../pages/payment-status";
import { payments } from "../pages/payments.page";
import { reportPanels } from "../pages/report-panels";
import { reports } from "../pages/reports.page";
import { settingsPanels } from "../pages/settings-panels";
import { settings } from "../pages/settings.page";
import { sharing } from "../pages/sharing.page";
import { state } from "../state/finance-state";
import { esc } from "../utils/formatters";
import { app } from "./app-root";
import { bind } from "./bind-events";

let latestLoad = 0;

async function load() {
  const loadNumber = ++latestLoad;
  try {
    state.me = await api("me");
    const [
      members,
      accounts,
      investments,
      payments,
      documents,
      transactions,
      shares,
      dashboard,
      reports,
    ] = await Promise.all(
      [
        "members",
        "accounts",
        "investments",
        "payments",
        "documents",
        "transactions",
        "shares",
        "dashboard",
        "reports",
      ].map((path) => api(path)),
    );
    if (loadNumber !== latestLoad) return;
    Object.assign(state, {
      members,
      accounts,
      investments,
      payments,
      documents,
      transactions,
      shares,
      dashboard,
      reports,
    });
    render();
  } catch (error) {
    if (loadNumber !== latestLoad) return;
    app.innerHTML = /* HTML */ `
      <main class="locked">
        <div class="lock-icon">◆</div>
        <h1>Family Finance</h1>
        <p>${esc(error instanceof Error ? error.message : error)}</p>
        <p class="muted">
          This private app needs a valid family login. For local development, configure the worker's
          DEV_EMAIL in .dev.vars.
        </p>
      </main>
    `;
  }
}
function render() {
  const content =
    (
      {
        Overview: overview,
        Accounts: accounts,
        Investments: investments,
        Payments: payments,
        Reports: reports,
        Documents: documentsView,
        Sharing: sharing,
        Settings: settings,
      } as Record<string, () => string>
    )[state.tab]?.() || overview();
  shell(content + reportPanels() + settingsPanels(), (tab) => {
    state.tab = tab;
    render();
  });
  bind(load);
  decoratePaymentStatuses();
}
export function initializeApplication() {
  void load();
}
