import { empty } from "../components/page-elements";
import { state } from "../state/finance-state";
import type { Item } from "../types/finance-record";
import { esc, money } from "../utils/formatters";

export function reportPanels() {
  const renderNetWorthCheckpoint = (point: Item) => /* HTML */ `
    <div class="list-row">
      <span class="round-icon">◈</span>
      <div class="grow">
        <strong>${esc(point.month)}</strong>
        <small>
          ${point.stale ? "At least one value was over 45 days old" : "Based on dated records"}
        </small>
      </div>
      <strong>${money(point.net_worth_paise)}</strong>
    </div>
  `;

  const renderAllocationRow = ([type, amount]: [string, number]) => /* HTML */ `
    <div class="list-row">
      <span class="round-icon">◈</span>
      <div class="grow">
        <strong>${esc(type.replace("_", " "))}</strong>
        <small>
          ${allocationTotal ? Math.round((amount / allocationTotal) * 100) : 0}% of visible
          investments
        </small>
      </div>
      <strong>${money(amount)}</strong>
    </div>
  `;

  const history: Item[] = state.reports?.history || [];
  const historyPanel =
    state.tab === "Reports"
      ? /* HTML */ `
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>Recorded net worth checkpoints</h2>
                <p>Shown only when every visible account and investment has a dated baseline</p>
              </div>
            </div>
            ${
              history.length
                ? history.map(renderNetWorthCheckpoint).join("")
                : empty(
                    "◈",
                    "No complete checkpoints yet",
                    "Add dated account balances and investment values to build history.",
                  )
            }
          </section>
        `
      : "";
  const allocation = new Map<string, number>();
  for (const item of state.investments)
    allocation.set(
      item.type,
      (allocation.get(item.type) || 0) +
        Number(item.latest?.value_paise ?? item.principal_paise ?? 0),
    );
  const allocationTotal = [...allocation.values()].reduce((sum, value) => sum + value, 0);
  const allocationPanel =
    state.tab === "Reports"
      ? /* HTML */ `
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>Investment allocation</h2>
                <p>Latest uploaded values; FD principal where no valuation is available</p>
              </div>
            </div>
            ${
              allocation.size
                ? [...allocation].map(renderAllocationRow).join("")
                : empty(
                    "◈",
                    "No holdings yet",
                    "Add a stock, mutual fund, or FD to see your allocation.",
                  )
            }
          </section>
        `
      : "";
  return historyPanel + allocationPanel;
}
