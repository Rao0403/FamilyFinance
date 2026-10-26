import { post } from "../api/finance-api";
import { field, value } from "../components/form-fields";
import { openModal } from "../components/modal";
import type { RefreshApplication } from "../types/finance-record";
import { paise, today } from "../utils/formatters";

export async function handleInvestmentAction(
  type: string,
  id: string | undefined,
  load: RefreshApplication,
) {
  const modal = (
    title: string,
    html: string,
    onSubmit?: (form: HTMLFormElement) => Promise<void>,
  ) => openModal(title, html, onSubmit, load);
  if (type === "investment")
    return modal(
      "Add investment",
      /* HTML */ `
        <label>
          Type
          <select name="type">
            <option value="stock">Stock</option>
            <option value="mutual_fund">Mutual fund</option>
            <option value="fd">Fixed deposit</option>
          </select>
        </label>
        ${field("Name", "name")}${field("Symbol or folio", "symbol", "text", false)}${field("Institution", "institution", "text", false)}${field("FD principal / starting amount (₹)", "principal", "number", false, 'step="0.01"')}${field("FD interest rate (%)", "rate", "number", false, 'step="0.01"')}${field("FD start date", "start_date", "date", false)}${field("FD maturity date", "maturity_date", "date", false)}${field("FD maturity amount (₹)", "maturity", "number", false, 'step="0.01"')}
      `,
      async (f) => {
        await post("investments", {
          type: value(f, "type"),
          name: value(f, "name"),
          symbol: value(f, "symbol"),
          institution: value(f, "institution"),
          principal_paise: value(f, "principal") ? paise(value(f, "principal")) : null,
          rate_bps: value(f, "rate") ? Math.round(Number(value(f, "rate")) * 100) : null,
          start_date: value(f, "start_date") || null,
          maturity_date: value(f, "maturity_date") || null,
          maturity_amount_paise: value(f, "maturity") ? paise(value(f, "maturity")) : null,
        });
      },
    );
  if (type === "snapshot")
    return modal(
      "Update investment value",
      [
        field("Value date", "as_of", "date", true, `value="${today()}"`),
        field("Quantity / units", "quantity", "text", false),
        field("Amount invested (₹)", "invested", "number", true, 'step="0.01"'),
        field("Current value (₹)", "current", "number", true, 'step="0.01"'),
      ].join(""),
      async (f) => {
        await post(`investments/${id}/snapshots`, {
          as_of: value(f, "as_of"),
          quantity: value(f, "quantity"),
          invested_paise: paise(value(f, "invested")),
          value_paise: paise(value(f, "current")),
        });
      },
    );
}
