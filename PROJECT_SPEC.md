# Family Finance Tracker — project specification (draft)

Status: **Implementation in progress.** Document parsers still require redacted family samples, and hosted services are not configured.

## 1. Purpose

Give four family members a reliable view of their own spending, investments, bank balances, upcoming payments, and net worth in INR. Members can share selected financial records with one another. No member, including an administrator, can see another member's private financial data without that member's permission.

The product should be built as one complete application against this specification. Features can be refined after use; this specification does not define prototype releases or staged versions.

## 2. Agreed decisions

- Four individual users, based in India; primary currency INR and dates/times displayed in India Standard Time.
- No shared finances or joint ownership in the initial data model. Every financial record has one owner.
- Financial information is private by default. Sharing is explicitly granted by the owner, including when the recipient is an administrator.
- Spending, investments, upcoming payments, and net worth are core areas. Loan management is outside the current scope because there are no loans to track.
- Investment types: listed stocks, mutual funds, and fixed deposits (FDs).
- Data is refreshed mainly by uploading source documents. Original files are retained for later reference.
- Indian Bank statements currently available to the family are PDFs covering the last 30 days. Groww report format remains to be confirmed; periodic Groww uploads will refresh investment data.
- Reminders are delivered by email and SMS, subject to each owner's notification settings.
- The family will mainly use the application in a web browser so it works on iOS, Android, and computers without separate native apps. The layout should work well on phones.

## 3. Users and access

Each member has an individual login. An administrator may invite or deactivate users and manage application settings, but has no automatic access to financial records.

The owner can grant and revoke view access to another member for an account, investment, payment, or its source document. The permission model must prevent exposure through summaries, charts, search, notifications, exports, and document downloads as well as detail pages. A family-wide number is calculated only from records the current viewer may see. The interface labels such numbers as **Visible to you**, so they are not mistaken for a complete family total.

Sharing an account also shares its transactions and associated statement files with that recipient. Revoking account access revokes access to all of these. Other document types follow their own owner's sharing settings.

Editing another person's records is not allowed unless the owner explicitly grants edit access. The owner can see who has access and when sharing changes were made. Revoking access removes the record from the recipient's views and future notifications.

## 4. Main product areas

### Dashboard

- Show the viewer's visible bank balances, investment values, upcoming payments, spending this month, and net worth.
- Show the owner, valuation date, and last update date where applicable. Mark stale or incomplete figures clearly.
- Allow filtering to own records or all records shared with the viewer.
- Show trends over time without presenting missing periods as zero.

### Accounts and transactions

- Create an Indian Bank account record with a masked account identifier and opening balance or statement starting balance.
- Import transactions and balances from Indian Bank statement PDFs. Support text PDFs; scanned PDFs require OCR and a review step.
- Store date, description, debit/credit amount, running balance when present, category, account, owner, and source reference.
- Categorize income, spending, transfers, refunds, fees, and investment contributions. Allow manual corrections and entries.
- Do not count transfers between tracked accounts as income or spending. Investment purchases change the form of an asset rather than becoming an expense.
- Detect overlapping statement periods and likely duplicate transactions. Highlight date gaps and reconcile imported closing balance with the account balance shown in the app.
- Provide transaction search, filters, monthly category totals, and exports.

### Investments

- Track stocks and mutual funds by owner, instrument, quantity/units, cost or invested amount, and latest uploaded valuation with its date.
- Import supported Groww reports after the actual file layout is inspected. Show an import preview and match incoming positions with existing holdings; prevent double counting across repeated uploads.
- Preserve historical uploads so portfolio values and contributions can be viewed over time. Clearly distinguish invested amount, current value, and gain/loss. Values from uploaded reports are snapshots, not live prices.
- Track each FD's bank, principal, interest rate, start date, maturity date, maturity amount (if available), and document. Show principal and maturity amount separately. Use a current value in net worth only when that value is available or an agreed calculation rule has been defined; otherwise use principal and label it.

### Payments and reminders

- Create one-time and recurring obligations such as bills, rent, subscriptions, premiums, and FD-related dates when relevant.
- Track amount, due date, frequency, owner, status, and optional linked account or source document.
- Show upcoming, overdue, and paid payments. A transaction can be matched to a payment for confirmation, with owner review before marking it paid.
- Allow each owner to choose reminder timing and email/SMS delivery. SMS messages use discreet wording by default and omit financial amounts unless the owner opts in.
- Schedule reminders in India Standard Time, record delivery attempts, and avoid duplicate messages for the same reminder event.

### Net worth and reports

- Calculate visible net worth as visible bank/cash balances plus visible investment values, minus any liabilities entered in the future. No loan module is required now.
- Show the date of each component used. A figure with stale holdings or missing bank periods must be labelled as such.
- Provide monthly spending and income trends, category breakdown, investment allocation, and net worth history. Shared records contribute only for viewers authorized to see them.

### Documents and import review

- Supported document classes: Indian Bank statement PDF, FD document PDF/image, and Groww investment report in its confirmed format. The importer architecture should accept additional templates later.
- Upload is private to the owner. The app extracts records into a review screen; nothing changes financial totals until the owner confirms.
- Show the exact source file and page/row where possible for every imported record. Keep the original file for later viewing or download by authorized users.
- Handle unsupported formats, unreadable scans, password-protected PDFs, and uncertain extracted fields without silently inventing values. If a PDF password is needed, use it for that import and do not retain it.
- Provide correction, reprocessing, and import rollback with an audit trail. Re-importing a file or an overlapping period should not create duplicate financial records.

## 5. Data and calculation rules

- Money is stored and displayed in INR with paise precision. Dates retain the source date and use India Standard Time for schedules.
- Every imported value retains provenance: document, page/row where available, import time, and any user correction.
- A statement balance is authoritative for the date it represents. Later app balances are derived from confirmed transactions and labelled with their last reconciled date.
- Investment values have an **as of** date. Gains/losses compare the value and invested amount from compatible snapshots, accounting for recorded purchases and sales rather than treating deposits as returns.
- Missing documents create an incomplete period; the dashboard must not imply that the displayed total is comprehensive.

## 6. Security and reliability requirements

- Protect logins with strong authentication and offer a second factor.
- Encrypt financial records and retained documents in storage and in transit. Restrict file access using the same owner permissions as extracted records.
- Keep an audit history for imports, edits, sharing changes, and document access.
- Back up data and documents, and provide owners a way to export their own records and delete their own data.
- Never ask for or store Indian Bank internet banking credentials, PINs, or OTPs.

## 7. Bank connection decision

Indian Bank is listed as live on India's Account Aggregator (AA) network, but Sahamati says direct participation as a Financial Information User is currently limited to entities regulated by a financial sector regulator. Therefore this specification commits to PDF statement import and does **not** promise automatic bank sync. A connection can be reconsidered only after a suitable authorized route, its costs, consent flow, and access limits are verified.

Sources: [Sahamati participant list](https://sahamati.org.in/fip-fiu-in-account-aggregators-ecosystem/), [Sahamati onboarding guidance](https://sahamati.org.in/how-to-join-the-account-aggregator-network-to-share-and-access-financial-data/), [Indian Bank statement download guide](https://www.indianbank.in/wp-content/uploads/2021/10/IndOASIS-Registration_28.10.2021_Website.pdf).

## 8. Hosting proposal for review

Use a hosted, mobile-friendly web app. The lowest-cost candidate identified is Cloudflare Workers Paid (currently $5 USD/month base), with D1 for structured records, a private R2 bucket for source documents, and Cloudflare Access for the four invited users. Current D1 and R2 included quotas appear ample for four people, but use must be measured. D1 Time Travel offers a 30-day recovery window on the paid Workers plan. Original R2 files also need an independent scheduled backup because database recovery does not restore deleted files. Access authenticates the visitor; the application still enforces each owner's per-record sharing permissions.

The PDF extraction design must fit Workers' execution limits. Where appropriate, extract text in the browser and send it to the server only after owner review; scanned-document OCR requires a separately verified approach. Financial documents should stay in private storage, with authorized access through the application only. This hosting choice is a proposal, not an approved deployment decision.

An alternative is Supabase Pro (currently from $25 USD/month) in its Mumbai region. It bundles database, authentication, file storage, and seven days of daily database backups, though file backups still need their own plan. Its higher recurring cost may buy simpler operations. The free Supabase plan can pause after low activity and does not include those automated database backups, so it is not the preferred home for the family's production records.

SMS delivery has separate provider charges and setup. The sender rules for India and the provider's requirements must be checked before choosing a service or promising delivery.

Sources: [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits and recovery](https://developers.cloudflare.com/d1/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Cloudflare plans](https://www.cloudflare.com/plans/), [Supabase pricing](https://supabase.com/pricing), [Supabase backups](https://supabase.com/docs/guides/platform/backups/), [Supabase regions](https://supabase.com/docs/guides/platform/regions), [TRAI sender guidance](https://www.trai.gov.in/advice-to-senders).

## 9. Inputs needed to finish and deploy

1. **Groww sample:** Confirm the available report formats and which exports cover stocks and mutual funds. A redacted sample file is needed to specify exact import columns and duplicate rules.
2. **FD documents:** Confirm whether the available files are text PDFs, scanned PDFs, or images. A redacted sample is needed for exact extraction fields.
3. **Hosting:** Cloudflare is the current implementation target. Configure a Cloudflare account, Access, D1, R2, and independent backups before deployment.
4. **Sharing detail:** Access lasts until the owner revokes it. An account grant includes its transactions and statement files.
5. **Reminders:** The default lead time is three days and only the payment owner receives email or SMS. MSG91 sender registration, approved template, and provider credentials are needed for live SMS delivery.

This specification continues to guide implementation. Decisions that depend on real file formats and hosted provider setup remain open.
