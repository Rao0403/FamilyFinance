import { api } from "../api/finance-api";
import { field, value } from "../components/form-fields";
import { openModal } from "../components/modal";
import type { RefreshApplication } from "../types/finance-record";

export async function handleProfileAction(
  type: string,
  _id: string | undefined,
  load: RefreshApplication,
) {
  const modal = (
    title: string,
    html: string,
    onSubmit?: (form: HTMLFormElement) => Promise<void>,
  ) => openModal(title, html, onSubmit, load);
  if (type === "delete-data")
    return modal(
      "Delete my financial data",
      /* HTML */ `
        <p>
          This permanently removes your financial records and uploaded files. Download your export
          first if you need a copy.
        </p>
        ${field("Type DELETE MY DATA", "confirm")}
      `,
      async (f) => {
        if (value(f, "confirm") !== "DELETE MY DATA")
          throw new Error("Type DELETE MY DATA exactly");
        await api("me/data", {
          method: "DELETE",
          body: JSON.stringify({ confirm: "DELETE MY DATA" }),
        });
      },
    );
}
