export type Member = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  active: number;
};
export type RecordRow = Record<string, unknown>;
