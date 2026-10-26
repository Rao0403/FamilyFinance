import { post } from "../api/finance-api";
import { field, value } from "../components/form-fields";
import { openModal } from "../components/modal";
import type { RefreshApplication } from "../types/finance-record";
import { paise } from "../utils/formatters";

export async function handleAccountAction(
  type: string,
  _id: string | undefined,
  load: RefreshApplication,
) {
  const modal = (
    title: string,
    html: string,
    onSubmit?: (form: HTMLFormElement) => Promise<void>,
  ) => openModal(title, html, onSubmit, load);
  if (type === "account")
    return modal(
      "Add bank account",
      [
        field("Account name", "name", "text", true, 'placeholder="e.g. Savings account"'),
        field(
          "Masked account number",
          "masked_number",
          "text",
          false,
          'placeholder="e.g. •••• 1234"',
        ),
        field("Opening balance (₹)", "opening_balance", "number", true, 'step="0.01" value="0"'),
        field("Balance date", "opening_date", "date", false),
      ].join(""),
      async (f) => {
        await post("accounts", {
          name: value(f, "name"),
          masked_number: value(f, "masked_number"),
          opening_balance_paise: paise(value(f, "opening_balance")),
          opening_date: value(f, "opening_date") || null,
        });
      },
    );
}
