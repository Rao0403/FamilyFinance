# Family Finance

A private browser-based finance tracker for four family members in India. Each member owns their data and explicitly controls sharing. The [project specification](docs/project-spec.md) records the agreed product rules.

## Repository layout

```text
frontend/             Browser application and Vite configuration
  src/
    app/              Startup, rendering, and event binding
    pages/            One view per navigation page
    actions/          Forms and actions grouped by finance area
    imports/          Document upload, review, and file parsers
    components/       Shared shell, modal, fields, and page elements
    api/              HTTP client
    state/            Browser state and access selectors
    styles/           Application styles
    types/            Browser record and callback types
    utils/            Formatting and error notification
backend/              Cloudflare Worker application
  src/
    worker.ts         HTTP and scheduled event entry point
    router.ts         Authentication and API route dispatch
    routes/           API handlers grouped by resource
    auth/             Identity verification and record permissions
    services/         Balances, audit, payment dates, and delivery adapters
    jobs/             Reminder scheduling and document cleanup
    lib/              Database, validation, JSON, and identifier helpers
    types/            Worker bindings, records, and route context
  migrations/         Ordered database migrations
docs/                 Product specification and code-flow guide
wrangler.jsonc        Deployment bindings, static assets, and cron schedule
package.json          Shared dependencies and commands run from the repo root
```

Start with [the code-flow guide](docs/code-structure.md) to trace a page, API request, document import, or scheduled job.

## Current implementation

- Cloudflare Worker API, D1 database, private R2 document storage, and a responsive browser UI.
- Individual membership with admin deactivation/reactivation, owner-controlled view/edit grants, and account sharing that includes transactions and linked statements.
- Indian Bank statement PDFs and term deposit summary PDFs are read in the browser into editable review tables. The uploader checks the suggested records and confirms a statement's ending balance before totals change. Overlapping statement imports retain their source links when an import is undone. Password-protected text PDFs can be opened with a password used only in the browser. Scanned PDFs still need OCR.
- Groww `.xlsx` holdings reports, and compatible CSV files, are read in the browser. The importer identifies the holdings table below the summary and preserves folio, units and the report's valuation date for review. A multi-deposit FD report is private unless its owner explicitly shares the entire document.
- The provided screenshots show headings but hide PDF data rows. PDF and spreadsheet importers have been checked with fictional examples; actual files still need private, local validation for differences in their rows, text layout, and formats before family use.
- Payment schedules with optional transaction matching, email reminder jobs, source documents, spending, investment allocation and net worth checkpoint reports, personal JSON export, and owner-initiated financial data deletion.
- Search and filter accessible transactions. Confirmed family transfers and loans appear in a family ledger; pending entries and changes require the other participant's approval. Family balances do not change net worth. Family ledger changes require migration `0006` locally before running the updated application.

**No live financial data or provider credentials are in this repository.** The deployment is not configured yet. Do not upload real statements to the local development database if other people can access that computer.

## Local development

Requirements: Node.js 24 and npm. On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked by execution policy.

1. Run `npm.cmd install`.
2. Create `.dev.vars` (ignored by Git) with `DEV_EMAIL=dev@example.com` and `BOOTSTRAP_ADMIN_EMAIL=dev@example.com`. This bypass is active only on localhost/127.0.0.1, and the variable must never be set in production.
3. Run `npm.cmd run db:migrate:local`.
4. Run `npm.cmd run build` and `npm.cmd run worker:dev`.
5. Open the URL Wrangler prints, normally `http://localhost:8787`.

If Wrangler cannot write its config directory in a restricted environment, set `XDG_CONFIG_HOME` to a writable directory in the workspace for that shell session. `.wrangler-config/` is ignored by Git.

Run all commands from the repository root:

| Command                         | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `npm.cmd run dev`               | Frontend development server; forwards `/api` to the local Worker |
| `npm.cmd run worker:dev`        | Local backend and built frontend assets                          |
| `npm.cmd run typecheck`         | Check frontend and backend TypeScript                            |
| `npm.cmd run build`             | Type check and build frontend assets into `dist/`                |
| `npm.cmd run test:imports`      | Run parser and review validation checks with fictional data      |
| `npm.cmd run test:balances`     | Check balance selection and migration using fictional data       |
| `npm.cmd run format`            | Format source, configuration, and developer documentation        |
| `npm.cmd run format:check`      | Check formatting without changing files                          |
| `npm.cmd run db:migrate:local`  | Apply `backend/migrations/` to the local database                |
| `npm.cmd run db:migrate:remote` | Apply the same migrations to the hosted database                 |

For frontend development, run the Worker and Vite in separate terminals. `.dev.vars`, Wrangler configuration, local database state, and build output stay at the root so existing local data and credentials use the same paths.

## Deployment preparation

Cloudflare is the proposed host. Before any production deployment:

1. Create a D1 database and a **private** R2 bucket. Replace `REPLACE_AFTER_CREATION` in `wrangler.jsonc` with the D1 database ID.
2. Configure Cloudflare Access for the entire Worker, with an allow policy containing only the four family email addresses. Cloudflare's [Worker Access guide](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) describes the Worker-level setting, which covers `workers.dev` and custom domains. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in Wrangler from that Access application.
3. Set `BOOTSTRAP_ADMIN_EMAIL` to the first family member's email. That address is the only account that can initialize the empty membership table. Other members are invited from the app and must also be on the Cloudflare Access allow list.
4. Keep `DEV_EMAIL` unset in production. Run `npm.cmd run build`, apply remote D1 migrations, then deploy with Wrangler. Verify private Access protection before inviting the family or uploading files.
5. Establish a separate backup of the D1 export **and** R2 documents before using the app with real data. D1 Time Travel alone does not back up R2 files. Test a restore using non-sensitive data.

Deployment should wait until document import tests with redacted real samples and the privacy checks are complete.

## Reminder providers

The Worker cron runs daily at 09:00 India Standard Time (`03:30` UTC). It sends a generic email to the payment owner only, avoiding payment names and amounts. It records whether the provider accepted or rejected each attempt.

- Email: configure a verified sender in `RESEND_FROM` and store `RESEND_API_KEY` as a Worker secret. The adapter uses [Resend's email API](https://resend.com/vercel).

The email provider account and credentials are not supplied by this repository.

## Backups

Keep backups outside this repository in an encrypted location accessible only to the family administrator. A D1 export contains everyone’s private data, regardless of app sharing permissions. Cloudflare documents `wrangler d1 export` for a SQL backup and `rclone copy` for downloading a complete R2 bucket.

```powershell
New-Item -ItemType Directory -Path 'D:\SecureFamilyFinanceBackup' -Force
npm.cmd exec -- wrangler d1 export family-finance --remote --output 'D:\SecureFamilyFinanceBackup\family-finance.sql'
rclone copy r2:family-finance-documents 'D:\SecureFamilyFinanceBackup\documents'
```

Configure the `r2` remote with a private R2 access key using [Cloudflare’s rclone guide](https://developers.cloudflare.com/r2/examples/rclone/). Check the exported SQL file and document count, then periodically restore into separate test resources to verify the backup. Never commit backups, R2 keys, or `.dev.vars` to Git. See [Cloudflare’s D1 export guide](https://developers.cloudflare.com/d1/best-practices/import-export-data/) for restore commands.

## Privacy model

Cloudflare Access checks sign-in at the edge. The Worker independently verifies the Access JWT and matches its email to an active invited member. Every finance query checks the owner or an explicit share. An administrator can manage membership but does not automatically see another person's records. Source files are never served from a public R2 URL.

An owner may delete their own financial records in Settings after typing a confirmation phrase. The database removes the records in one transaction and queues source files for R2 deletion. Failed file deletions are retried by the daily scheduled Worker. Membership and the deletion audit event remain; a backup created before deletion must be managed separately by the backup administrator.

See [Cloudflare Access authorization](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/) for the signed identity token and the [project spec](docs/project-spec.md) for the intended access rules.
