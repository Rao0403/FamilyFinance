export const alertError = (error: unknown) => {
  window.alert(error instanceof Error ? error.message : String(error));
};
