import { clearDeletedDocuments } from "./jobs/document-cleanup";
import { runReminders } from "./jobs/payment-reminders";
import { fail } from "./lib/http";
import { handleRequest } from "./router";
import type { Env } from "./types/environment";

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env).catch((error) => {
      const message = error instanceof Error ? error.message : "";
      if (
        [
          "Amount must be an integer number of paise",
          "Invalid date",
          "Expected a JSON object",
          "Account not found",
          "Invalid fixed deposit reference",
          "Invalid fixed deposit values",
          "Duplicate fixed deposit in this report",
        ].includes(message)
      )
        return fail(400, message);
      console.error("Request failed", error);
      return fail(500, "Request failed. Refresh to check the latest state");
    });
  },
  scheduled(controller: ScheduledController, env: Env) {
    return Promise.all([
      runReminders(env, new Date(controller.scheduledTime)),
      clearDeletedDocuments(env),
    ]).then(() => {});
  },
} satisfies ExportedHandler<Env>;
