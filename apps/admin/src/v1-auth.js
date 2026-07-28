export function v1AuthPayload(credentials = {}) {
  return {
    email: String(credentials.email || "").trim(),
    password: String(credentials.password || ""),
    ...(credentials.totp ? { totp: String(credentials.totp) } : {}),
  };
}
