import type { Item } from "../types/finance-record";
import { empty, pill, sectionHeader } from "../components/page-elements";
import { nameOf } from "../state/finance-selectors";
import { state } from "../state/finance-state";
import { dateLabel, esc, money } from "../utils/formatters";

export function investments() {
  const renderIOption = (i: Item) => /* HTML */ `
    <tr>
      <td>
        <strong>${esc(i.name)}</strong>
        <small class="table-sub">${esc(i.symbol || i.institution || "")}</small>
      </td>
      <td>
        ${pill(i.type === "mutual_fund" ? "Mutual fund" : i.type === "fd" ? "Fixed deposit" : "Stock")}
      </td>
      <td>${esc(nameOf(i.owner_id))}</td>
      <td>${dateLabel(i.latest?.as_of || i.start_date)}</td>
      <td class="right">${money(i.latest?.invested_paise ?? i.principal_paise)}</td>
      <td class="right">
        <strong>${money(i.latest?.value_paise ?? i.principal_paise)}</strong>
      </td>
      <td>
        ${
          i.can_edit && i.type !== "fd"
            ? /* HTML */ `
                <button class="text-button" data-action="snapshot" data-id="${esc(i.id)}">
                  Update
                </button>
              `
            : ""
        }
      </td>
    </tr>
  `;

  const list = state.investments;
  return /* HTML */ `
    ${sectionHeader(
      "YOUR PORTFOLIO",
      "Investments",
      "Stocks, mutual funds and fixed deposits in one place.",
      /* HTML */ `
        <div class="head-actions">
          <button class="secondary" data-action="upload">↑ Upload report</button>
          <button class="primary" data-action="investment">＋ Add investment</button>
        </div>
      `,
    )}
    <div class="summary-bar">
      <div>
        <small>Total current value</small>
        <strong>
          ${money(list.reduce((n, x) => n + Number(x.latest?.value_paise ?? x.principal_paise ?? 0), 0))}
        </strong>
      </div>
      <div>
        <small>Invested amount</small>
        <strong>
          ${money(list.reduce((n, x) => n + Number(x.latest?.invested_paise ?? x.principal_paise ?? 0), 0))}
        </strong>
      </div>
      <div>
        <small>Holdings</small>
        <strong>${list.length}</strong>
      </div>
    </div>
    <section class="panel table-panel">
      <div class="panel-head">
        <div>
          <h2>All holdings</h2>
          <p>Values come from your latest report or entry</p>
        </div>
      </div>
      ${
        list.length
          ? /* HTML */ `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Holding</th>
                      <th>Type</th>
                      <th>Owner</th>
                      <th>As of</th>
                      <th class="right">Invested</th>
                      <th class="right">Value</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>${list.map(renderIOption).join("")}</tbody>
                </table>
              </div>
            `
          : empty(
              "◈",
              "No investments yet",
              "Add a holding or upload a Groww report when available.",
            )
      }
    </section>
  `;
}
