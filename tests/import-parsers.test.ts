import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { asMoney } from "../backend/src/lib/validation";
import { suggestRows } from "../frontend/src/imports/parsers/bank-statement-parser";
import { suggestFixedDeposits } from "../frontend/src/imports/parsers/fixed-deposit-parser";
import { parseGrowwSheets } from "../frontend/src/imports/parsers/groww-report-parser";
import type { PdfLine } from "../frontend/src/imports/parsers/pdf-text-extractor";
import { prepareReviewedRows } from "../frontend/src/imports/validate-review";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });
const line = (lineNumber: number, ...items: [string, number, number][]): PdfLine => ({
  page: 1,
  line: lineNumber,
  items: items.map(([text, x, width]) => ({ text, x, width })),
});

test("bank statement reads debit and credit columns without guessing unclear rows", () => {
  const parsed = suggestRows([
    line(0, ["For period: 01 Feb 2024 - 29 Feb 2024", 145, 250]),
    line(
      1,
      ["Date", 145, 30],
      ["Transaction Details", 260, 150],
      ["Debits", 485, 50],
      ["Credits", 640, 55],
      ["Balance", 795, 60],
    ),
    line(
      2,
      ["01/02/2024", 145, 70],
      ["Sample grocery", 260, 100],
      ["150.00", 495, 40],
      ["9,850.00", 795, 60],
    ),
    line(
      3,
      ["02/02/2024", 145, 70],
      ["Sample salary", 260, 100],
      ["200.00", 655, 40],
      ["10,050.00", 785, 70],
    ),
    line(4, ["03/02/2024", 145, 70], ["Unclear amount", 260, 100], ["1,000", 495, 40]),
  ]);
  assert.deepEqual(
    parsed.rows.map((row) => [row.date, row.amount_paise, row.balance_paise]),
    [
      ["2024-02-01", -15000, 985000],
      ["2024-02-02", 20000, 1005000],
    ],
  );
  assert.equal(parsed.rows[0].source_ref, "page 1, line 2");
  assert.equal(parsed.statement.closing_date, "2024-02-29");
  assert.match(parsed.warnings.join(" "), /1 dated line/);
  assert.equal(suggestRows([line(1, ["01/02/2024 unknown 100.00", 100, 300])]).rows.length, 0);
});

test("FD summary extracts reviewed fields and never sends the full reference as an import row", async () => {
  const result = suggestFixedDeposits([
    line(
      1,
      ["Account Number", 115, 130],
      ["Account Holder's Name", 250, 175],
      ["Receipt Type", 430, 105],
      ["Date of Deposit", 538, 116],
      ["Deposit Amount", 657, 122],
      ["Currency", 782, 74],
      ["Tenure", 858, 167],
      ["Interest Rate", 1033, 96],
      ["Maturity Date", 1132, 105],
      ["Maturity Amount", 1240, 130],
    ),
    line(
      2,
      ["000000123456", 120, 120],
      ["Fictional Member", 255, 130],
      ["Regular", 450, 60],
      ["01/03/2024", 540, 110],
      ["50,000", 665, 100],
      ["INR", 790, 40],
      ["1 year", 890, 60],
      ["7.25", 1060, 40],
      ["01/03/2025", 1135, 100],
      ["53,625", 1260, 100],
    ),
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].principal_paise, 5000000);
  assert.equal(result.rows[0].rate_bps, 725);
  assert.equal(result.rows[0].maturity_date, "2025-03-01");
  assert.equal(result.rows[0].report_date, "");
  await assert.rejects(
    () => prepareReviewedRows("fd", result.rows, "fictional-owner"),
    /report date/,
  );
  result.rows[0].report_date = "2024-04-15";
  const [prepared] = await prepareReviewedRows("fd", result.rows, "fictional-owner");
  assert.equal(prepared.account_suffix, "3456");
  assert.match(prepared.identity_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(prepared).includes("000000123456"));
  assert.deepEqual(await prepareReviewedRows("fd", result.rows, "fictional-owner"), [prepared]);
  assert.notEqual(
    (await prepareReviewedRows("fd", result.rows, "another-owner"))[0].identity_hash,
    prepared.identity_hash,
  );
});

test("Groww holdings table is found below the summary and separate folios stay distinct", async () => {
  const data: unknown[][] = Array.from({ length: 20 }, () => []);
  data[2] = ["Personal Details"];
  data[3] = ["Name", "Fictional Member"];
  data[17] = ["HOLDINGS AS ON 2024-04-15"];
  data[20] = [
    "Scheme Name",
    "AMC",
    "Category",
    "Sub-category",
    "Folio No.",
    "Source",
    "Units",
    "Invested Value",
    "Current Value",
    "Returns",
    "XIRR",
  ];
  data.push(
    [],
    [
      "Example Fund",
      "Example AMC",
      "Equity",
      "Large Cap",
      "001234",
      "Groww",
      10.5,
      1000,
      1100,
      100,
      0.1,
    ],
    ["Example Fund", "Example AMC", "Equity", "Large Cap", "005678", "Groww", 4, 500, 550, 50, 0.1],
    ["Missing Value Fund", "Example AMC", "Equity", "", "009999", "Groww", 2, null, 200],
  );
  const result = parseGrowwSheets([{ sheet: "Holdings", data }]);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(
    result.rows
      .slice(0, 2)
      .map((row) => [row.type, row.symbol, row.quantity, row.as_of, row.source_ref]),
    [
      ["mutual_fund", "001234", "10.5", "2024-04-15", "Holdings!row 23"],
      ["mutual_fund", "005678", "4", "2024-04-15", "Holdings!row 24"],
    ],
  );
  assert.equal(result.rows[2].invested_paise, null);
  await assert.rejects(
    () => prepareReviewedRows("investment", result.rows, "fictional-owner"),
    /invested amount/,
  );
  const repeated = [
    { ...result.rows[0], symbol: "" },
    { ...result.rows[1], symbol: "" },
  ];
  await assert.rejects(
    () => prepareReviewedRows("investment", repeated, "fictional-owner"),
    /duplicate holding/,
  );
});

test("missing amounts are rejected and supported CSV dates are normalized", () => {
  assert.throws(() => asMoney(null), /Amount must be an integer/);
  assert.throws(() => asMoney(""), /Amount must be an integer/);
  assert.equal(asMoney(0), 0);
  const result = parseGrowwSheets([
    {
      sheet: "CSV",
      data: [
        ["Scheme Name", "Invested Amount", "Current Value", "Valuation Date"],
        ["Fictional Fund", "1,000.00", "1,100.00", "15/04/2024"],
      ],
    },
  ]);
  assert.equal(result.rows[0].as_of, "2024-04-15");
  assert.equal(result.rows[0].invested_paise, 100000);
});
