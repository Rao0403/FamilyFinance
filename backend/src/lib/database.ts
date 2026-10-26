import type { RecordRow } from "../types/records";

export const readAll = async <T = RecordRow>(statement: D1PreparedStatement) =>
  (await statement.all<T>()).results;
