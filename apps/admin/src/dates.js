export function memoryDate(value, timezone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  try { return date.toLocaleDateString(undefined, { timeZone: timezone }); }
  catch { return date.toLocaleDateString(undefined, { timeZone: "UTC" }); }
}
