export function v1AuthPayload(credentials = {}, options = {}) {
  const payload = {
    email: String(credentials.email || "").trim(),
    password: String(credentials.password || ""),
  };

  if (credentials.totp) payload.totp = String(credentials.totp);
  if (options.setup) payload.bootstrapToken = String(credentials.bootstrapToken || "");

  return payload;
}
