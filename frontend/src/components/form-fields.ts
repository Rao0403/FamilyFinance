export const value = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) || "");
export const field = (
  label: string,
  name: string,
  type = "text",
  required = true,
  extra = "",
) => /* HTML */ `
  <label>
    ${label}
    <input name="${name}" type="${type}" ${required ? "required" : ""} ${extra} />
  </label>
`;
