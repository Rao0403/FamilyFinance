# Family Finance

Family Finance is a browser-based finance tracker built for one family in India. It brings bank transactions, investments, upcoming payments and money exchanged between family members into one place, with amounts in INR.

The project is **under active development**. It is designed for a single family of up to four members, not for multiple independent families. Hosting, backups and email delivery require separate configuration and verification. There is no bank-account connection: members upload reports or enter information manually.

## What it does

- **Accounts and spending:** import text-based Indian Bank PDF statements, review transactions and ending balances, and search or filter transactions. The app uses the latest dated balance and recorded later transactions; a balance is assumed to include all transactions on its date.
- **Investments:** import Indian Bank term deposit summary PDFs and Groww mutual fund holdings reports in `.xlsx` or compatible CSV format. Review suggested records before saving. Later reports update matching holdings and add new ones; the owner can confirm removal of holdings missing from a report. Original uploads and historical observations are retained.
- **Payments:** record upcoming and recurring payments, optionally link an account transaction, and configure email reminders. Email requires a verified sender and provider credentials.
- **Family ledger:** record transfers, family loans and repayments. Both participants must agree before an entry becomes visible to the family; proposed changes also require confirmation. Family debts are shown separately and do not change net worth.
- **Sharing:** records are private in the app until their owner shares them. Sharing an account includes its transactions and statement files. Confirmed family ledger entries are visible to all active family members.
- **Reports and data controls:** view spending, investment and net-worth summaries for records you can access; export your data or request deletion of your own financial data.

PDF and spreadsheet layouts can vary. Check imported rows and report dates against the source before saving. Scanned PDFs need manual entry; uploaded values are snapshots, not live market prices. A report with no reviewed holdings or with mixed report dates does not trigger missing-holding prompts.

## Privacy and security

Cloudflare Access authenticates each member. The application verifies their identity and applies owner-controlled sharing permissions; the app administrator does not automatically see another member's private records in the app. An account owner can revoke a share. Original documents are stored in a private R2 bucket and accessed through the application.

The hosting account owner and anyone with access to database or document backups may have broader access outside the application. This is not end-to-end encrypted storage. Keep hosting credentials and backups secure, and do not commit real financial documents, local databases, API keys, or `.dev.vars`.

The local development identity bypass is only for `localhost` and `127.0.0.1`; never configure `DEV_EMAIL` in production. Hosted Access protection, permissions and backup restores must be verified before using real financial data.

## Run locally

Requirements: Node.js 24 and npm. Run the commands from the repository root. On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked by the execution policy.

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Create `.dev.vars` in the project root. It is ignored by Git:

   ```text
   DEV_EMAIL=dev@example.com
   BOOTSTRAP_ADMIN_EMAIL=dev@example.com
   ```

3. Apply the local database migrations, build the frontend and start the Worker:

   ```powershell
   npm.cmd run db:migrate:local
   npm.cmd run build
   npm.cmd run worker:dev
   ```

4. Open the address Wrangler prints, usually `http://localhost:8787`. Local database state and uploaded files stay on the computer running Wrangler. Stop the server with `Ctrl+C`.

For another local test identity, first add a member through the app, then change `DEV_EMAIL` to that member's email and restart the Worker. Keep `BOOTSTRAP_ADMIN_EMAIL` unchanged. Local identities are a development convenience, not production sign-in.

## Commands

| Command                        | Purpose                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `npm.cmd run dev`              | Start the frontend development server; `/api` is forwarded to the local Worker |
| `npm.cmd run worker:dev`       | Start the local Worker and serve the built frontend                            |
| `npm.cmd run build`            | Type-check the project and build the frontend                                  |
| `npm.cmd run test:imports`     | Test document parsing and review with fictional data                           |
| `npm.cmd run test:balances`    | Test balance selection and migration with fictional data                       |
| `npm.cmd run test:investments` | Test report matching and confirmed closures with fictional data                |
| `npm.cmd run format:check`     | Check source formatting                                                        |
| `npm.cmd run db:migrate:local` | Apply migrations to the local D1 database                                      |

## Hosting and reminders

The current deployment target is Cloudflare Workers with D1, a private R2 bucket and Cloudflare Access. The repository contains placeholder bindings, not a configured deployment. Each installation needs its own resources, Access policy and administrator identity. Do not use a production database for local experiments.

Before family use:

1. Create a D1 database and private R2 bucket. Configure the Worker bindings without committing account-specific credentials.
2. Protect **all traffic** to the Worker with Cloudflare Access, restrict the policy to the family's email addresses, and configure the Access team domain, audience and bootstrap administrator email. Enable an appropriate sign-in method and verify unauthenticated requests are denied. See [Cloudflare's Worker Access guide](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
3. Build the app and apply the remote migrations. Test each family member's access and privacy using fictional records before uploading real data.
4. Set up independent backups for both D1 and R2, and test restoring them. D1 Time Travel does not restore R2 documents; see [D1 backups](https://developers.cloudflare.com/d1/reference/time-travel/) and [R2 CLI tools](https://developers.cloudflare.com/r2/get-started/cli/).
5. For email reminders, configure a verified sender in `RESEND_FROM` and store `RESEND_API_KEY` as a Worker secret. The daily job runs at 09:00 India Standard Time and sends a generic reminder without payment details. See [Resend's documentation](https://resend.com/docs).

The Cloudflare Free plan may suit a small family, but its request, execution and database limits should be checked against real usage. Email, storage overages, domains and backup services may have separate costs.

## Project structure

```text
frontend/             Browser UI, pages, actions, imports and styles
backend/src/          Worker API, authentication, routes, services and jobs
backend/migrations/   Ordered D1 schema migrations
tests/                Tests using fictional data
scripts/              Local development and diagnostic utilities
docs/                 Project specification and code-flow guide
wrangler.jsonc        Template Worker bindings and schedule
```

See the [project specification](docs/project-spec.md) for product decisions and the [code-flow guide](docs/code-structure.md) for navigating the implementation.
