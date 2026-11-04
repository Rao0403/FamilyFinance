export interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  BOOTSTRAP_ADMIN_EMAIL: string;
  DEV_EMAIL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}
