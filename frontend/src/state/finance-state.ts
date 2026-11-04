import type { Item } from "../types/finance-record";

export const state: {
  me?: Item;
  members: Item[];
  accounts: Item[];
  investments: Item[];
  payments: Item[];
  documents: Item[];
  transactions: Item[];
  shares: Item[];
  ledger: { entries: Item[]; proposals: Item[]; links: Item[] };
  reports?: Item;
  dashboard?: Item;
  tab: string;
  preview?: {
    file: File;
    target: string;
    kind: string;
    rows: Item[];
    raw: string;
    warnings: string[];
    statement?: { closing_date: string };
    documentId?: string;
  };
} = {
  members: [],
  accounts: [],
  investments: [],
  payments: [],
  documents: [],
  transactions: [],
  shares: [],
  ledger: { entries: [], proposals: [], links: [] },
  tab: "Overview",
};
