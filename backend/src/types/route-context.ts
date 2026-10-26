import type { Env } from "./environment";
import type { Member } from "./records";

export interface RouteContext {
  request: Request;
  env: Env;
  member: Member;
  url: URL;
  path: string[];
  method: string;
  key: string;
}
export type RouteHandler = (context: RouteContext) => Promise<Response | null>;
