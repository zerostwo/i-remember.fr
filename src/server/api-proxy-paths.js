export function storageProxyPath(value = "/uploads") {
  const path = `/${String(value).replace(/^\/+|\/+$/g, "")}`;
  return path === "/" ? "/uploads" : path;
}

export function apiProxyPatterns(storageBase = "/uploads") {
  const path = storageProxyPath(storageBase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Original public uploads are handled by the revival middleware.
  const exclusions = storageProxyPath(storageBase) === "/uploads" ? "(?!posts/|tmp/)" : "";
  return ["^/api/v1(?:/|\\?|$)", `^${path}/${exclusions}`];
}

export function isApiProxyPath(pathname, storageBase) {
  return apiProxyPatterns(storageBase).some((pattern) => new RegExp(pattern).test(pathname));
}

export function viteApiProxy(target, storageBase) {
  return Object.fromEntries(apiProxyPatterns(storageBase).map((pattern) => [pattern, {
    target,
    changeOrigin: false,
  }]));
}
