import type { RefreshApplication } from "../types/finance-record";
import { handleAccountAction } from "./accounts.actions";
import { handleFamilyLedgerAction } from "./family-ledger.actions";
import { handleDocumentAction } from "./document.actions";
import { handleInvestmentAction } from "./investment.actions";
import { handleMemberAction } from "./member.actions";
import { handlePaymentAction } from "./payment.actions";
import { handleProfileAction } from "./profile.actions";
import { handleSharingAction } from "./sharing.actions";
import { handleTransactionAction } from "./transactions.actions";

const actions: Record<
  string,
  (type: string, id: string | undefined, refresh: RefreshApplication) => unknown
> = {
  account: handleAccountAction,
  "ledger-add": handleFamilyLedgerAction,
  "ledger-edit": handleFamilyLedgerAction,
  "ledger-delete": handleFamilyLedgerAction,
  "ledger-link": handleFamilyLedgerAction,
  "ledger-confirm": handleFamilyLedgerAction,
  "ledger-reject": handleFamilyLedgerAction,
  transaction: handleTransactionAction,
  "transaction-edit": handleTransactionAction,
  investment: handleInvestmentAction,
  snapshot: handleInvestmentAction,
  payment: handlePaymentAction,
  paid: handlePaymentAction,
  revoke: handleSharingAction,
  deactivate: handleMemberAction,
  "delete-data": handleProfileAction,
  rollback: handleDocumentAction,
  reprocess: handleDocumentAction,
  invite: handleMemberAction,
  upload: handleDocumentAction,
  "import-account": handleDocumentAction,
};
export async function action(type: string, id: string | undefined, refresh: RefreshApplication) {
  if (Object.hasOwn(actions, type)) await actions[type](type, id, refresh);
}
