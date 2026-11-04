# Code structure and review guide

The root package manages both applications. `frontend/` contains browser code; `backend/` contains Worker code and database migrations. Configuration that coordinates both applications, including `wrangler.jsonc`, stays at the root.

## Browser startup and page rendering

1. `frontend/index.html` loads `frontend/src/main.ts`.
2. `main.ts` loads styles and calls `initializeApplication()` in `app/application.ts`.
3. `application.ts` loads the signed-in member and visible records through `api/finance-api.ts`, then updates `state/finance-state.ts`.
4. The selected `pages/*.page.ts` function renders that page. Report and Settings supplementary panels have their own files beside the main pages.
5. `components/app-shell.ts` renders navigation and the page content. `app/bind-events.ts` connects buttons and forms to actions.
6. `actions/action-dispatcher.ts` selects a resource-specific `*.actions.ts` handler. Those handlers open forms and call the API.

Actions and import dialogs receive a refresh callback from the application. Shared components do not import application startup or rendering, so a modal can save and refresh without a circular dependency.

## API request flow

1. `backend/src/worker.ts` receives an HTTP request and applies the shared error response handling.
2. `router.ts` forwards non-API requests to static assets. API requests pass through `auth/authenticate-member.ts` before route dispatch.
3. `types/route-context.ts` describes the request, environment, authenticated member, URL, and path passed to a route.
4. `routes/*.routes.ts` handles the resource operation. Shared finance helpers live in `services/`; JSON, validation, and database helpers live in `lib/`.
5. `auth/resource-permissions.ts` enforces ownership and explicit sharing. Membership administration does not bypass these checks.

| API prefix          | Route file               |
| ------------------- | ------------------------ |
| `/api/me`           | `profile.routes.ts`      |
| `/api/members`      | `members.routes.ts`      |
| `/api/shares`       | `sharing.routes.ts`      |
| `/api/accounts`     | `accounts.routes.ts`     |
| `/api/transactions` | `transactions.routes.ts` |
| `/api/investments`  | `investments.routes.ts`  |
| `/api/payments`     | `payments.routes.ts`     |
| `/api/reminders`    | `reminders.routes.ts`    |
| `/api/documents`    | `documents.routes.ts`    |
| `/api/imports`      | `imports.routes.ts`      |
| `/api/dashboard`    | `dashboard.routes.ts`    |
| `/api/reports`      | `reports.routes.ts`      |
| `/api/export`       | `data-export.routes.ts`  |

All route files in the table are under `backend/src/routes/`.

## Document import flow

1. `frontend/src/imports/document-upload.ts` collects the file and target account or investment.
2. `imports/parsers/pdf-text-extractor.ts` reads text PDFs in the browser. `groww-report-parser.ts` reads `.xlsx` workbooks and compatible CSV rows in the browser.
3. `bank-statement-parser.ts`, `fixed-deposit-parser.ts`, and `groww-report-parser.ts` suggest records for the owner to review. `validate-review.ts` checks entries before import and masks FD account references.
4. `imports/document-review.ts` displays and edits the suggestions. Confirmation uploads the original file and commits reviewed rows through the API.
5. `backend/src/routes/documents.routes.ts` stores and serves private source files. `imports.routes.ts` commits or rolls back extracted records.
6. `backend/src/services/account-balances.ts` derives an account's balance from its latest confirmed statement ending balance and subsequent transactions. Each overlapping transaction retains links to its source statements. `fixed-deposit-import.ts` stores reviewed FD report observations and restores earlier values on rollback.

Reprocessing and rollback actions start in `frontend/src/actions/document.actions.ts`. Exact document templates and OCR remain subject to the limitations recorded in the project specification.

## Scheduled work

`backend/src/worker.ts` handles scheduled events and starts two jobs:

- `jobs/payment-reminders.ts` checks due dates and records delivery attempts. It calls `services/reminder-delivery.ts` to send email.
- `jobs/document-cleanup.ts` retries deletion of private source files queued by an owner's data deletion request.

`wrangler.jsonc` defines the cron schedule and D1/R2 bindings. `backend/src/types/environment.ts` describes those bindings and provider variables.

## Where to make common changes

| Change                               | Start here                                                              |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Page content or layout               | `frontend/src/pages/<area>.page.ts`                                     |
| Navigation and shared layout styles  | `frontend/src/styles/shell.css` and `shared.css`                        |
| Area-specific styles                 | `frontend/src/styles/<area>.css`                                        |
| Phone and tablet rules               | `frontend/src/styles/responsive.css`                                    |
| Shared navigation                    | `frontend/src/components/app-shell.ts`                                  |
| A form or button action              | `frontend/src/actions/<area>.actions.ts`                                |
| Account or transaction form          | `frontend/src/actions/accounts.actions.ts` or `transactions.actions.ts` |
| Modal or input behavior              | `frontend/src/components/modal.ts` and `form-fields.ts`                 |
| Currency, dates, or escaping         | `frontend/src/utils/formatters.ts`                                      |
| Bank, FD, or Groww extraction        | `frontend/src/imports/parsers/`                                         |
| API behavior                         | `backend/src/routes/<area>.routes.ts`                                   |
| Access to financial records or files | `backend/src/auth/resource-permissions.ts`                              |
| Sign-in verification                 | `backend/src/auth/authenticate-member.ts`                               |
| Balance calculations                 | `backend/src/services/account-balances.ts`                              |
| Email provider integration           | `backend/src/services/reminder-delivery.ts`                             |
| Database schema                      | Add a new numbered file in `backend/migrations/`                        |
| Hosting bindings and cron            | `wrangler.jsonc`                                                        |
| Product requirements                 | `docs/project-spec.md`                                                  |

## Repository checks

Run `npm.cmd run format:check` and `npm.cmd run build` from the root after a change. For changes that affect request routing, also start `npm.cmd run worker:dev` and exercise the relevant API with synthetic records. Review privacy checks whenever an operation reads or changes another member's records.

Migration filenames and SQL contents are preserved when moving them into `backend/migrations/`; existing migration history remains valid. Local state stays in the ignored root `.wrangler/` folder.
