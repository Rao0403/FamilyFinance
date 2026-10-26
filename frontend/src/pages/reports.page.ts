import { empty, sectionHeader } from "../components/page-elements";
import { state } from "../state/finance-state";
import type { Item } from "../types/finance-record";
import { esc, money } from "../utils/formatters";

export function reports() {
  const renderMonthlyCashFlow = (m: Item) => /* HTML */ `
    <div class="chart-group">
      <div class="bars">
        <div
          class="bar income"
          style="height:${Math.max(3, Math.round((m.income_paise / max) * 130))}px"
          title="Income ${money(m.income_paise)}"
        ></div>
        <div
          class="bar spending"
          style="height:${Math.max(3, Math.round((m.spending_paise / max) * 130))}px"
          title="Spending ${money(m.spending_paise)}"
        ></div>
      </div>
      <span>${esc(m.month.slice(5))}/${esc(m.month.slice(2, 4))}</span>
    </div>
  `;

  const renderCategoryRow = (c: Item) => /* HTML */ `
    <div class="list-row">
      <span class="round-icon">↗</span>
      <div class="grow"><strong>${esc(c.category)}</strong></div>
      <strong>${money(c.amount_paise)}</strong>
    </div>
  `;

  const months: Item[] = state.reports?.monthly || [];
  const categories: Item[] = state.reports?.categories || [];
  const max = Math.max(1, ...months.map((m) => Math.max(m.spending_paise, m.income_paise)));
  return /* HTML */ `
    ${sectionHeader(
      "YOUR TRENDS",
      "Reports",
      "Income and spending from the transactions you can see.",
      /* HTML */ `
        <a class="secondary" href="/api/export" download>↓ Export my data</a>
      `,
    )}
    <div class="two-col">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Monthly cash flow</h2>
            <p>Only months with recorded transactions are shown</p>
          </div>
        </div>
        ${
          months.length
            ? /* HTML */ `
                <div class="chart">${months.slice(-12).map(renderMonthlyCashFlow).join("")}</div>
                <div class="legend">
                  <span>
                    <i class="income"></i>
                    Income
                  </span>
                  <span>
                    <i class="spending"></i>
                    Spending
                  </span>
                </div>
              `
            : empty("▥", "No trends yet", "Import transactions to see monthly income and spending.")
        }
      </section>
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Spending by category</h2>
            <p>Visible transactions across recorded months</p>
          </div>
        </div>
        ${
          categories.length
            ? categories.slice(0, 10).map(renderCategoryRow).join("")
            : empty("▥", "No spending categories", "Categorize expenses to see the breakdown.")
        }
      </section>
    </div>
    <p class="report-note">
      Net worth history needs multiple dated balance and investment snapshots. Missing periods are
      never shown as zero.
    </p>
  `;
}
