import { identity } from "./auth/authenticate-member";
import { fail } from "./lib/http";
import { handleAccountsRoutes } from "./routes/accounts.routes";
import { handleDashboardRoutes } from "./routes/dashboard.routes";
import { handleDataExportRoutes } from "./routes/data-export.routes";
import { handleDocumentsRoutes } from "./routes/documents.routes";
import { handleImportsRoutes } from "./routes/imports.routes";
import { handleInvestmentsRoutes } from "./routes/investments.routes";
import { handleMembersRoutes } from "./routes/members.routes";
import { handlePaymentsRoutes } from "./routes/payments.routes";
import { handleProfileRoutes } from "./routes/profile.routes";
import { handleRemindersRoutes } from "./routes/reminders.routes";
import { handleReportsRoutes } from "./routes/reports.routes";
import { handleSharingRoutes } from "./routes/sharing.routes";
import { handleTransactionsRoutes } from "./routes/transactions.routes";
import type { Env } from "./types/environment";
import type { Member } from "./types/records";
import type { RouteHandler } from "./types/route-context";

const routes: Record<string, RouteHandler> = {
  me: handleProfileRoutes,
  members: handleMembersRoutes,
  shares: handleSharingRoutes,
  accounts: handleAccountsRoutes,
  transactions: handleTransactionsRoutes,
  investments: handleInvestmentsRoutes,
  payments: handlePaymentsRoutes,
  reminders: handleRemindersRoutes,
  documents: handleDocumentsRoutes,
  imports: handleImportsRoutes,
  dashboard: handleDashboardRoutes,
  reports: handleReportsRoutes,
  export: handleDataExportRoutes,
};
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  let member: Member | null;
  try {
    member = await identity(request, env);
  } catch {
    return fail(401, "Authentication failed");
  }
  if (!member) return fail(401, "Access is restricted to invited family members");
  const routePath = url.pathname.split("/").filter(Boolean).slice(1);
  const key = routePath[0];
  const route = Object.hasOwn(routes, key) ? routes[key] : undefined;
  return (
    (route &&
      (await route({ request, env, member, url, path: routePath, method: request.method, key }))) ||
    fail(404, "Not found")
  );
}
