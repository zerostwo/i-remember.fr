import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  DatabaseBackup,
  Download,
  ExternalLink,
  FileText,
  Home,
  ImageIcon,
  Languages,
  LogOut,
  Menu as MenuIcon,
  MessageSquare,
  MonitorSmartphone,
  Palette,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { mergeV1Assets, v1AssetUploadPayload } from "./v1-assets.js";
import { deleteV1MenuItem, syncV1MenuItem, syncV1Page, syncV1Settings, v1PageMemory } from "./v1-content.js";
import { mergeV1Dashboard } from "./v1-dashboard.js";
import { archiveV1Memory, syncV1Memory } from "./v1-memory.js";

const routes = [
  { id: "dashboard", label: "Dashboard", title: "Today in the archive", group: "Overview", icon: Home },
  { id: "memory", label: "Memory", title: "Memory", group: "Content management", icon: Archive },
  { id: "pages", label: "Pages", title: "Pages", group: "Content management", icon: FileText },
  { id: "comments", label: "Comments", title: "Comments", group: "Content management", icon: MessageSquare },
  { id: "attachments", label: "Attachments", title: "Attachments", group: "Content management", icon: ImageIcon },
  { id: "theme", label: "Theme", title: "Theme", group: "Appearance", icon: Palette },
  { id: "menus", label: "Menus", title: "Footer menu", group: "Appearance", icon: MenuIcon },
  { id: "settings", label: "Settings", title: "Settings", group: "System", icon: Settings },
  { id: "backups", label: "Backups", title: "Backups", group: "System", icon: DatabaseBackup },
];

const routeMap = new Map(routes.map((route) => [route.id, route]));
const groupedRoutes = routes.reduce((groups, route) => {
  if (!groups.has(route.group)) groups.set(route.group, []);
  groups.get(route.group).push(route);
  return groups;
}, new Map());

const menuTypes = ["PAGE", "MEMORY", "SEARCH", "EXTERNAL", "TERMS", "CREDITS", "LANGUAGE"];
const pageStatuses = ["PUBLISHED", "DRAFT", "ARCHIVED"];
const memoryStatuses = ["published", "pending", "archived"];
const v1TokenKey = "i-remember:v1-admin-token";

function normalizeRouteId(value = "") {
  const routeId = decodeURIComponent(String(value || ""))
    .replace(/^\/+|\/+$/g, "")
    .split("/")[0];
  return routeMap.has(routeId) ? routeId : "dashboard";
}

function routeFromPathname(pathname = window.location.pathname) {
  const normalized = pathname.replace(/\/+$/g, "") || "/admin";
  if (normalized === "/admin" || normalized === "/admin/index.html") return "dashboard";
  if (!normalized.startsWith("/admin/")) return "dashboard";
  return normalizeRouteId(normalized.slice("/admin/".length));
}

function routeFromLegacyHash(hash = window.location.hash) {
  const routeId = String(hash || "").replace(/^#\/?/, "");
  return routeId ? normalizeRouteId(routeId) : "";
}

function routeFromLocation() {
  return routeFromLegacyHash() || routeFromPathname();
}

function pathForRoute(routeId) {
  return `/admin/${normalizeRouteId(routeId)}`;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.errorMsg || `Request failed: ${response.status}`);
  }
  return payload.data;
}

function adminToken(value) {
  try {
    if (value === undefined) return window.sessionStorage.getItem(v1TokenKey) || "";
    if (value) window.sessionStorage.setItem(v1TokenKey, value);
    else window.sessionStorage.removeItem(v1TokenKey);
  } catch (_error) {
    return "";
  }
  return value || "";
}

async function v1Api(path, options = {}) {
  const token = adminToken();
  if (!token) throw new Error("No v1 admin token");
  return api(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function rememberV1Token(credentials) {
  try {
    const session = await api("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    });
    adminToken(session.token);
  } catch (_error) {
    adminToken("");
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("File read failed")));
    reader.readAsDataURL(file);
  });
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(value = "") {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
}

function markdownToHtml(value = "") {
  const output = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      output.push("</ul>");
      listOpen = false;
    }
  };

  String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        closeList();
        return;
      }
      if (trimmed.startsWith("### ")) {
        closeList();
        output.push(`<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`);
        return;
      }
      if (trimmed.startsWith("## ")) {
        closeList();
        output.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`);
        return;
      }
      if (trimmed.startsWith("# ")) {
        closeList();
        output.push(`<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`);
        return;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!listOpen) {
          output.push("<ul>");
          listOpen = true;
        }
        output.push(`<li>${inlineMarkdown(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
        return;
      }
      closeList();
      output.push(`<p>${inlineMarkdown(trimmed)}</p>`);
    });

  closeList();
  return output.join("");
}

function containsQuery(values, query) {
  if (!query) return true;
  return values.join(" ").toLowerCase().includes(query.toLowerCase());
}

function statusVariant(value) {
  const status = String(value || "").toLowerCase();
  if (status === "published" || status === "normal") return "default";
  if (status === "pending" || status === "draft") return "secondary";
  if (status === "archived") return "outline";
  return "outline";
}

function StatusBadge({ value }) {
  return (
    <Badge variant={statusVariant(value)} className="capitalize">
      {String(value || "unknown").toLowerCase()}
    </Badge>
  );
}

function AdminSelect({ value, onValueChange, options, placeholder, className }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || option} value={option.value || option}>
            {option.label || option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TextField({ label, description, value, onChange, type = "text", ...props }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} {...props} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function TextareaField({ label, description, value, onChange, rows = 5, ...props }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea value={value || ""} onChange={(event) => onChange(event.target.value)} rows={rows} {...props} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function ToggleField({ label, description, checked, onCheckedChange }) {
  return (
    <Field orientation="horizontal" className="items-start justify-between rounded-lg border bg-card/40 p-3">
      <div className="space-y-1">
        <FieldLabel>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </Field>
  );
}

function MarkdownPreview({ value }) {
  return (
    <div
      className="markdown-preview rounded-lg border bg-background/50 p-4 text-sm"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }}
    />
  );
}

export function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [route, setRoute] = useState(routeFromLocation);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [memoryFilter, setMemoryFilter] = useState("all");
  const [selectedMemoryId, setSelectedMemoryId] = useState(null);
  const [selectedPageSlug, setSelectedPageSlug] = useState("");
  const [selectedMenuId, setSelectedMenuId] = useState(null);

  useEffect(() => {
    let active = true;
    api("/api/admin/session")
      .then((session) => {
        if (active) {
          setNeedsSetup(Boolean(session.needsSetup));
          setAuthenticated(Boolean(session.authenticated));
        }
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const legacyPayload = await api("/api/admin/bootstrap");
      const dashboard = await v1Api("/api/v1/dashboard").catch(() => null);
      const assets = await v1Api("/api/v1/assets").catch(() => []);
      const comments = await v1Api("/api/v1/comments?status=all").catch(() => []);
      const payload = {
        ...mergeV1Assets(mergeV1Dashboard(legacyPayload, dashboard), assets),
        comments,
      };
      setData(payload);
      setSelectedMemoryId((current) => (
        payload.memories.some((memory) => memory.id === current) ? current : payload.memories[0]?.id || null
      ));
      setSelectedPageSlug((current) => (
        payload.pages.some((page) => page.slug === current) ? current : payload.pages[0]?.slug || ""
      ));
      setSelectedMenuId((current) => (
        payload.menu.some((item) => item.id === current) ? current : payload.menu[0]?.id || null
      ));
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const legacyRoute = routeFromLegacyHash();
    if (legacyRoute) {
      window.history.replaceState({ route: legacyRoute }, "", pathForRoute(legacyRoute));
      setRoute(legacyRoute);
    }

    const handleLocation = () => setRoute(routeFromLocation());
    window.addEventListener("popstate", handleLocation);
    window.addEventListener("hashchange", handleLocation);
    return () => {
      window.removeEventListener("popstate", handleLocation);
      window.removeEventListener("hashchange", handleLocation);
    };
  }, []);

  useEffect(() => {
    if (authenticated) refreshData();
  }, [authenticated, refreshData]);

  function navigate(nextRoute) {
    const target = routeMap.has(nextRoute) ? nextRoute : "dashboard";
    const targetPath = pathForRoute(target);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ route: target }, "", targetPath);
    }
    setRoute(target);
  }

  async function handleLogin(credentials) {
    setLoading(true);
    setError("");
    try {
      const session = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      if (session.requiresTwoFactor) return session;
      await rememberV1Token(credentials);
      setAuthenticated(true);
      return session;
    } catch (loginError) {
      setError(loginError.message);
      throw loginError;
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(credentials) {
    setLoading(true);
    setError("");
    try {
      const session = await api("/api/admin/setup", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      await rememberV1Token(credentials);
      setNeedsSetup(false);
      setAuthenticated(true);
      window.history.replaceState({ route: "dashboard" }, "", "/admin");
      setRoute("dashboard");
      return session;
    } catch (setupError) {
      setError(setupError.message);
      throw setupError;
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => null);
    adminToken("");
    setAuthenticated(false);
    setData(null);
    window.history.replaceState({ route: "dashboard" }, "", "/admin");
    setRoute("dashboard");
  }

  async function runAction(label, action) {
    setNotice("");
    setError("");
    try {
      const result = await action();
      setNotice(label);
      return result;
    } catch (actionError) {
      setError(actionError.message);
      return null;
    }
  }

  async function saveMemory(id, payload) {
    await runAction("Memory saved", async () => {
      const saved = await api(`/api/admin/memories/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await syncV1Memory(v1Api, saved).catch(() => null);
      setSelectedMemoryId(saved.id);
      await refreshData();
    });
  }

  async function createMemory() {
    await runAction("Memory created", async () => {
      const saved = await api("/api/admin/memories", {
        method: "POST",
        body: JSON.stringify({
          title: "Untitled memory",
          author: "I Remember",
          excerpt: "A new editable memory.",
          status: "pending",
          isLongForm: true,
          bodyMarkdown: "# Untitled memory\n\nWrite this memory in Markdown.",
        }),
      });
      await syncV1Memory(v1Api, saved).catch(() => null);
      setSelectedMemoryId(saved.id);
      await refreshData();
    });
  }

  async function deleteMemory(id) {
    const memory = data?.memories?.find((item) => item.id === id);
    if (!memory || !window.confirm(`Archive "${memory.title || memory.excerpt || "this memory"}"?`)) return;
    await runAction("Memory archived", async () => {
      const archived = await api(`/api/admin/memories/${id}`, { method: "DELETE" });
      await archiveV1Memory(v1Api, archived).catch(() => null);
      await refreshData();
    });
  }

  async function uploadAttachment(file, memoryId) {
    const memory = data?.memories?.find((item) => String(item.id) === String(memoryId));
    if (!file || !memory) return;
    await runAction("Attachment uploaded", async () => {
      const synced = await syncV1Memory(v1Api, memory);
      if (!synced?.id) throw new Error("Memory could not be synced to v1 before upload");
      const contentBase64 = await readFileAsDataUrl(file);
      await v1Api("/api/v1/assets", {
        method: "POST",
        body: JSON.stringify(v1AssetUploadPayload(file, contentBase64, synced.id)),
      });
      await refreshData();
    });
  }

  async function savePage(slug, payload) {
    await runAction("Page saved", async () => {
      const saved = await api(`/api/admin/pages/${encodeURIComponent(slug)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await syncV1Page(v1Api, saved).catch(() => null);
      const pageMemory = v1PageMemory(saved);
      if (pageMemory) await syncV1Memory(v1Api, pageMemory).catch(() => null);
      setSelectedPageSlug(saved.slug);
      await refreshData();
    });
  }

  async function createPage() {
    await runAction("Page created", async () => {
      const slug = `page-${Date.now().toString(36)}`;
      const saved = await api("/api/admin/pages", {
        method: "POST",
        body: JSON.stringify({
          slug,
          title: "Untitled page",
          excerpt: "A new footer page.",
          status: "DRAFT",
          bodyMarkdown: "# Untitled page\n\nWrite this page in Markdown.",
        }),
      });
      await syncV1Page(v1Api, saved).catch(() => null);
      const pageMemory = v1PageMemory(saved);
      if (pageMemory) await syncV1Memory(v1Api, pageMemory).catch(() => null);
      setSelectedPageSlug(saved.slug);
      await refreshData();
    });
  }

  async function saveMenuItem(id, payload) {
    await runAction("Menu item saved", async () => {
      const saved = await api(`/api/admin/menu-items/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await syncV1MenuItem(v1Api, saved).catch(() => null);
      setSelectedMenuId(saved.id);
      await refreshData();
    });
  }

  async function createMenuItem() {
    await runAction("Menu item created", async () => {
      const saved = await api("/api/admin/menu-items", {
        method: "POST",
        body: JSON.stringify({
          label: "New item",
          type: "PAGE",
          targetValue: data?.pages?.[0]?.slug || "about",
          position: (data?.menu?.at(-1)?.position || 0) + 10,
          isVisible: true,
        }),
      });
      await syncV1MenuItem(v1Api, saved).catch(() => null);
      setSelectedMenuId(saved.id);
      await refreshData();
    });
  }

  async function deleteMenuItem(id) {
    const item = data?.menu?.find((candidate) => candidate.id === id);
    await runAction("Menu item deleted", async () => {
      await api(`/api/admin/menu-items/${id}`, { method: "DELETE" });
      await deleteV1MenuItem(v1Api, item).catch(() => null);
      setSelectedMenuId(null);
      await refreshData();
    });
  }

  async function updateCommentStatus(id, status) {
    await runAction("Comment updated", async () => {
      if (status === "ARCHIVED") {
        await v1Api(`/api/v1/comments/${encodeURIComponent(id)}`, { method: "DELETE" });
      } else {
        await v1Api(`/api/v1/comments/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
      }
      await refreshData();
    });
  }

  async function saveSettings(payload) {
    await runAction("Settings saved", async () => {
      const settings = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await syncV1Settings(v1Api, settings).catch(() => null);
      setData((current) => current ? { ...current, settings: { ...current.settings, ...settings } } : current);
    });
  }

  async function saveAccount(payload) {
    await runAction("Account updated", async () => {
      const account = await api("/api/admin/account", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setData((current) => current ? {
        ...current,
        settings: { ...current.settings, account },
      } : current);
    });
  }

  async function exportBackup() {
    await runAction("Backup exported", async () => {
      const bundle = await api("/api/admin/export");
      const stamp = String(bundle.generatedAt || new Date().toISOString()).slice(0, 10);
      downloadJson(`i-remember-backup-${stamp}.json`, bundle);
    });
  }

  async function setupTwoFactor() {
    return runAction("Two-factor setup created", () => api("/api/admin/2fa/setup", { method: "POST" }));
  }

  async function enableTwoFactor(payload) {
    await runAction("Two-factor enabled", async () => {
      const account = await api("/api/admin/2fa/enable", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setData((current) => current ? {
        ...current,
        settings: { ...current.settings, account },
      } : current);
    });
  }

  async function disableTwoFactor(payload) {
    await runAction("Two-factor disabled", async () => {
      const account = await api("/api/admin/2fa/disable", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setData((current) => current ? {
        ...current,
        settings: { ...current.settings, account },
      } : current);
    });
  }

  const currentRoute = routeMap.get(route) || routeMap.get("dashboard");

  if (checkingSession) {
    return (
      <main className="i-remember-admin dark grid min-h-screen place-items-center bg-background p-4 text-foreground">
        <LoadingState />
      </main>
    );
  }

  if (!authenticated) {
    if (needsSetup) return <SetupScreen loading={loading} onSetup={handleSetup} />;
    return <LoginScreen loading={loading} onLogin={handleLogin} />;
  }

  return (
    <main className="i-remember-admin dark min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <AdminSidebar route={route} navigate={navigate} />
        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-muted-foreground">{currentRoute.group}</p>
                <h1 className="archive-serif truncate text-2xl font-semibold md:text-3xl">{currentRoute.title}</h1>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative sm:w-72">
                  <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search memory, page, comment..."
                    type="search"
                  />
                </div>
                <Button variant="outline" onClick={handleLogout}>
                  <LogOut data-icon="inline-start" />
                  Log out
                </Button>
              </div>
            </div>
            <MobileNav route={route} navigate={navigate} />
          </header>

          <div className="px-4 py-5 md:px-6">
            {error ? <StatusMessage variant="error" message={error} /> : null}
            {notice ? <StatusMessage message={notice} /> : null}
            {loading && !data ? <LoadingState /> : null}
            {data ? (
              <AdminRoute
                route={route}
                data={data}
                search={search}
                memoryFilter={memoryFilter}
                setMemoryFilter={setMemoryFilter}
                selectedMemoryId={selectedMemoryId}
                setSelectedMemoryId={setSelectedMemoryId}
                selectedPageSlug={selectedPageSlug}
                setSelectedPageSlug={setSelectedPageSlug}
                selectedMenuId={selectedMenuId}
                setSelectedMenuId={setSelectedMenuId}
                createMemory={createMemory}
                saveMemory={saveMemory}
                deleteMemory={deleteMemory}
                uploadAttachment={uploadAttachment}
                createPage={createPage}
                savePage={savePage}
                createMenuItem={createMenuItem}
                saveMenuItem={saveMenuItem}
                deleteMenuItem={deleteMenuItem}
                updateCommentStatus={updateCommentStatus}
                saveSettings={saveSettings}
                saveAccount={saveAccount}
                setupTwoFactor={setupTwoFactor}
                enableTwoFactor={enableTwoFactor}
                disableTwoFactor={disableTwoFactor}
                exportBackup={exportBackup}
                navigate={navigate}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginScreen({ loading, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [loginError, setLoginError] = useState("");

  async function submitLogin(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const result = await onLogin({ email, password, totp: requiresTwoFactor ? totp : "" });
      if (result?.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setTotp("");
      }
    } catch (error) {
      setLoginError(error.message);
    }
  }

  return (
    <main className="i-remember-admin dark grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <div className="login-frame grid w-full max-w-5xl overflow-hidden rounded-lg border bg-card shadow-2xl md:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden min-h-[540px] border-r p-10 md:flex md:flex-col md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">self-hosted archive</p>
            <h1 className="archive-serif mt-4 max-w-lg text-6xl font-semibold leading-none">I Remember</h1>
          </div>
          <div className="grid gap-4">
            <div className="fade-ring">
              <strong>13%</strong>
              <span>fade from memories</span>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Manage memories, pages, footer menus, tracking, backups, and the anonymous public submission flow.
            </p>
          </div>
        </section>
        <section className="flex min-h-[540px] items-center p-5 sm:p-8">
          <Card className="w-full rounded-lg border-0 bg-transparent shadow-none ring-0">
            <CardHeader className="px-0">
              <CardTitle className="archive-serif text-4xl">Admin login</CardTitle>
            <CardDescription>Use the admin account for this deployment.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <form className="grid gap-5" onSubmit={submitLogin}>
                <FieldGroup>
                  <TextField label="Username or email" value={email} onChange={setEmail} autoComplete="username" />
                  <TextField label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
                  {requiresTwoFactor ? (
                    <TextField label="Two-factor code" value={totp} onChange={setTotp} inputMode="numeric" autoComplete="one-time-code" />
                  ) : null}
                </FieldGroup>
                {loginError ? <StatusMessage variant="error" message={loginError} /> : null}
                <Button className="w-full" disabled={loading} type="submit" size="lg">
                  Enter admin
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function SetupScreen({ loading, onSetup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupError, setSetupError] = useState("");

  async function submitSetup(event) {
    event.preventDefault();
    setSetupError("");
    try {
      await onSetup({ email, password });
    } catch (error) {
      setSetupError(error.message);
    }
  }

  return (
    <main className="i-remember-admin dark grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <div className="login-frame grid w-full max-w-5xl overflow-hidden rounded-lg border bg-card shadow-2xl md:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden min-h-[540px] border-r p-10 md:flex md:flex-col md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">first run</p>
            <h1 className="archive-serif mt-4 max-w-lg text-6xl font-semibold leading-none">I Remember</h1>
          </div>
          <div className="grid gap-4">
            <div className="fade-ring">
              <strong>0</strong>
              <span>memories yet</span>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Create the first administrator before the public archive opens.
            </p>
          </div>
        </section>
        <section className="flex min-h-[540px] items-center p-5 sm:p-8">
          <Card className="w-full rounded-lg border-0 bg-transparent shadow-none ring-0">
            <CardHeader className="px-0">
              <CardTitle className="archive-serif text-4xl">Create admin</CardTitle>
              <CardDescription>Set the first administrator for this deployment.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <form className="grid gap-5" onSubmit={submitSetup}>
                <FieldGroup>
                  <TextField label="Username or email" value={email} onChange={setEmail} autoComplete="username" />
                  <TextField label="Password" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
                </FieldGroup>
                {setupError ? <StatusMessage variant="error" message={setupError} /> : null}
                <Button className="w-full" disabled={loading} type="submit" size="lg">
                  Create admin
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function AdminSidebar({ route, navigate }) {
  return (
    <aside className="hidden border-r bg-card/55 px-5 py-6 lg:block">
      <div className="sticky top-6">
        <button className="mb-7 block text-left" onClick={() => navigate("dashboard")} type="button">
          <span className="archive-serif block text-3xl font-semibold leading-none">I Remember</span>
          <span className="mt-1 block text-xs text-muted-foreground">admin archive</span>
        </button>
        <div className="fade-ring mb-7">
          <strong>13%</strong>
          <span>fade from memories</span>
        </div>
        <nav className="grid gap-5" aria-label="Admin sections">
          {[...groupedRoutes.entries()].map(([group, groupRoutes]) => (
            <div key={group} className="grid gap-1.5">
              <p className="px-2 text-[11px] font-medium uppercase text-muted-foreground">{group}</p>
              {groupRoutes.map((item) => (
                <NavButton key={item.id} item={item} active={route === item.id} onClick={() => navigate(item.id)} />
              ))}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function MobileNav({ route, navigate }) {
  const mobileRoutes = routes.filter((item) => ["dashboard", "memory", "menus", "settings"].includes(item.id));
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
      {mobileRoutes.map((item) => (
        <Button
          key={item.id}
          variant={route === item.id ? "default" : "outline"}
          size="sm"
          onClick={() => navigate(item.id)}
        >
          <item.icon data-icon="inline-start" />
          {item.label}
        </Button>
      ))}
    </div>
  );
}

function NavButton({ item, active, onClick }) {
  return (
    <Button
      className={cn("w-full justify-start", active && "bg-primary text-primary-foreground hover:bg-primary/90")}
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      type="button"
    >
      <item.icon data-icon="inline-start" />
      {item.label}
    </Button>
  );
}

function StatusMessage({ message, variant = "success" }) {
  return (
    <div className={cn("mb-4 rounded-lg border px-3 py-2 text-sm", variant === "error" ? "border-destructive/40 text-destructive" : "text-muted-foreground")}>
      {message}
    </div>
  );
}

function LoadingState() {
  return (
    <Card className="rounded-lg">
      <CardContent className="py-10 text-sm text-muted-foreground">Loading admin data...</CardContent>
    </Card>
  );
}

function AdminRoute(props) {
  switch (props.route) {
    case "memory":
      return <MemoryView {...props} />;
    case "pages":
      return <PagesView {...props} />;
    case "comments":
      return (
        <CommentsView
          data={props.data}
          search={props.search}
          updateCommentStatus={props.updateCommentStatus}
        />
      );
    case "attachments":
      return (
        <AttachmentsView
          data={props.data}
          search={props.search}
          selectedMemoryId={props.selectedMemoryId}
          uploadAttachment={props.uploadAttachment}
        />
      );
    case "theme":
      return <ThemeView data={props.data} />;
    case "menus":
      return <MenusView {...props} />;
    case "settings":
      return (
        <SettingsView
          data={props.data}
          saveSettings={props.saveSettings}
          saveAccount={props.saveAccount}
          setupTwoFactor={props.setupTwoFactor}
          enableTwoFactor={props.enableTwoFactor}
          disableTwoFactor={props.disableTwoFactor}
        />
      );
    case "backups":
      return <BackupsView exportBackup={props.exportBackup} />;
    default:
      return <DashboardView data={props.data} navigate={() => props.navigate("memory")} />;
  }
}

function DashboardView({ data, navigate }) {
  const counts = data.counts || {};
  const pending = data.memories.filter((memory) => memory.status === "pending");
  const queue = pending.length ? pending : data.memories.slice(0, 4);
  const settings = data.settings || {};

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pending memory" value={counts.pendingMemory || 0} detail="anonymous submissions" icon={Archive} />
        <MetricCard label="Published memory" value={counts.publishedMemory || 0} detail="archive and long reads" icon={ShieldCheck} />
        <MetricCard label="Footer menu" value={counts.menuItems || 0} detail="lower-right navigation" icon={MenuIcon} />
        <MetricCard label="Attachments" value={counts.attachments || 0} detail="local and archive images" icon={ImageIcon} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Review queue</CardTitle>
            <CardDescription>Newest memories and long-form entries.</CardDescription>
            <CardAction>
              <Button variant="outline" onClick={navigate}>
                Open Memory
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {queue.map((memory) => (
                <MemoryListItem key={memory.id} memory={memory} />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Publishing health</CardTitle>
            <CardDescription>System switches that affect the public archive.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <HealthRow label="Public memory submissions" value={settings.anonymousSubmissions ? "Open" : "Closed"} />
            <HealthRow label="Default language" value={(settings.defaultLanguage || "en").toUpperCase()} />
            <HealthRow label="Auto approval" value={settings.autoApproveSubmissions ? "On" : "Off"} />
            <HealthRow label="Umami tracking" value={settings.tracking?.enabled ? "On" : "Off"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="archive-serif text-4xl">{value}</CardTitle>
        <CardAction>
          <Icon className="size-5 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

function HealthRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/45 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <strong className="text-sm font-medium">{value}</strong>
    </div>
  );
}

function MemoryView({
  data,
  search,
  memoryFilter,
  setMemoryFilter,
  selectedMemoryId,
  setSelectedMemoryId,
  createMemory,
  saveMemory,
  deleteMemory,
}) {
  const [page, setPage] = useState(1);
  const memories = data.memories || [];
  const filtered = memories.filter((memory) => {
    const matchesFilter =
      memoryFilter === "all" ||
      (memoryFilter === "long" && memory.isLongForm) ||
      memory.status === memoryFilter;
    return matchesFilter && containsQuery([memory.title, memory.author, memory.excerpt, memory.status, memory.source], search);
  });
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = memories.find((memory) => memory.id === selectedMemoryId) || pageItems[0] || filtered[0];

  useEffect(() => {
    setPage(1);
  }, [search, memoryFilter]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Memory</CardTitle>
          <CardDescription>Posts and anonymous memories are managed as one Memory stream.</CardDescription>
          <CardAction>
            <Button onClick={createMemory}>
              <Plus data-icon="inline-start" />
              New memory
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Tabs value={memoryFilter} onValueChange={setMemoryFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
              <TabsTrigger value="long">Long form</TabsTrigger>
            </TabsList>
          </Tabs>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Memory</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((memory) => (
                <TableRow
                  key={memory.id}
                  className={cn("cursor-pointer", selected?.id === memory.id && "bg-muted/60")}
                  onClick={() => setSelectedMemoryId(memory.id)}
                >
                  <TableCell className="min-w-72">
                    <MemoryListItem memory={memory} compact />
                  </TableCell>
                  <TableCell>{memory.author}</TableCell>
                  <TableCell><StatusBadge value={memory.status} /></TableCell>
                  <TableCell className="text-right text-muted-foreground">{memory.isLongForm ? "Long" : "Short"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-2 border-t pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <MemoryEditor memory={selected} onSave={saveMemory} onDelete={deleteMemory} />
    </div>
  );
}

function MemoryListItem({ memory, compact = false }) {
  return (
    <div className={cn("flex items-center gap-3", !compact && "rounded-lg border bg-background/40 p-3")}>
      <div
        className="size-12 shrink-0 rounded-md border bg-cover bg-center"
        style={{ backgroundImage: `url("${memory.imageUrl || "/uploads/posts/revival-upload/thumb.jpg"}")` }}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{memory.title || memory.excerpt}</p>
        <p className="truncate text-xs text-muted-foreground">
          {memory.language?.toUpperCase()} · {memory.source || "archive"}
        </p>
      </div>
      {!compact ? <StatusBadge value={memory.status} /> : null}
    </div>
  );
}

function MemoryEditor({ memory, onSave, onDelete }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    setDraft(memory ? { ...memory } : null);
  }, [memory]);

  if (!memory || !draft) {
    return (
      <Card className="rounded-lg">
        <CardContent className="py-10 text-sm text-muted-foreground">No memory selected.</CardContent>
      </Card>
    );
  }

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Edit Memory</CardTitle>
        <CardDescription>Long entries will expose Read more on public cards.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={(event) => {
          event.preventDefault();
          onSave(memory.id, draft);
        }}>
          <div className="aspect-[16/9] rounded-lg border bg-cover bg-center" style={{ backgroundImage: `url("${draft.imageUrl || "/uploads/posts/revival-upload/resized.jpg"}")` }} />
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Title" value={draft.title} onChange={(value) => update("title", value)} />
              <TextField label="Author" value={draft.author} onChange={(value) => update("author", value)} />
            </div>
            <TextareaField label="Excerpt" value={draft.excerpt} onChange={(value) => update("excerpt", value)} rows={3} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Status</FieldLabel>
                <AdminSelect value={draft.status} onValueChange={(value) => update("status", value)} options={memoryStatuses} />
              </Field>
              <TextField label="Image key" value={draft.imageKey} onChange={(value) => update("imageKey", value)} />
            </div>
            <ToggleField
              label="Long-form Memory"
              description="Show a short card first and allow Read more on public cards."
              checked={Boolean(draft.isLongForm)}
              onCheckedChange={(value) => update("isLongForm", value)}
            />
            <TextareaField
              label="Metadata JSON"
              value={draft.metadataJson}
              onChange={(value) => update("metadataJson", value)}
              rows={5}
            />
            <TextareaField label="Memory Markdown" value={draft.bodyMarkdown} onChange={(value) => update("bodyMarkdown", value)} rows={12} />
            <MarkdownPreview value={draft.bodyMarkdown} />
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              <Save data-icon="inline-start" />
              Save memory
            </Button>
            <Button type="button" variant="outline" onClick={() => onDelete(memory.id)} disabled={draft.status === "archived"}>
              <Trash2 data-icon="inline-start" />
              Archive memory
            </Button>
            {draft.publicUrl ? (
              <Button variant="outline" asChild>
                <a href={draft.publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  Open public
                </a>
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PagesView({ data, search, selectedPageSlug, setSelectedPageSlug, createPage, savePage }) {
  const pages = data.pages || [];
  const filtered = pages.filter((page) => containsQuery([page.title, page.slug, page.excerpt, page.status], search));
  const selected = pages.find((page) => page.slug === selectedPageSlug) || filtered[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(380px,1fr)]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Pages</CardTitle>
          <CardDescription>Published pages are mirrored into long-form Memory entries.</CardDescription>
          <CardAction>
            <Button onClick={createPage}>
              <Plus data-icon="inline-start" />
              New page
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-2">
          {filtered.map((page) => (
            <button
              key={page.slug}
              className={cn("rounded-lg border bg-background/40 p-3 text-left transition hover:bg-muted/50", selected?.slug === page.slug && "bg-muted")}
              onClick={() => setSelectedPageSlug(page.slug)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{page.title}</p>
                <StatusBadge value={page.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">/{page.slug} · {page.excerpt || "No excerpt"}</p>
            </button>
          ))}
        </CardContent>
      </Card>
      <PageEditor page={selected} onSave={savePage} />
    </div>
  );
}

function PageEditor({ page, onSave }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    setDraft(page ? { ...page } : null);
  }, [page]);

  if (!page || !draft) {
    return (
      <Card className="rounded-lg">
        <CardContent className="py-10 text-sm text-muted-foreground">No page selected.</CardContent>
      </Card>
    );
  }

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Edit Page</CardTitle>
        <CardDescription>Menu page targets search this mirrored long-form Memory.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={(event) => {
          event.preventDefault();
          onSave(page.slug, draft);
        }}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Slug" value={draft.slug} onChange={(value) => update("slug", value)} />
              <Field>
                <FieldLabel>Status</FieldLabel>
                <AdminSelect value={draft.status} onValueChange={(value) => update("status", value)} options={pageStatuses} />
              </Field>
            </div>
            <TextField label="Title" value={draft.title} onChange={(value) => update("title", value)} />
            <TextareaField label="Excerpt" value={draft.excerpt} onChange={(value) => update("excerpt", value)} rows={3} />
            <TextareaField label="Page Markdown" value={draft.bodyMarkdown} onChange={(value) => update("bodyMarkdown", value)} rows={14} />
            <MarkdownPreview value={draft.bodyMarkdown} />
          </FieldGroup>
          <Button className="w-fit" type="submit">
            <Save data-icon="inline-start" />
            Save page
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MenusView({ data, search, selectedMenuId, setSelectedMenuId, createMenuItem, saveMenuItem, deleteMenuItem }) {
  const menu = data.menu || [];
  const filtered = menu.filter((item) => containsQuery([item.label, item.type, item.targetValue, item.url], search));
  const selected = menu.find((item) => item.id === selectedMenuId) || filtered[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(380px,1fr)]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Footer menu</CardTitle>
          <CardDescription>Controls the public home page lower-right navigation.</CardDescription>
          <CardAction>
            <Button onClick={createMenuItem}>
              <Plus data-icon="inline-start" />
              Add item
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              className={cn("rounded-lg border bg-background/40 p-3 text-left transition hover:bg-muted/50", selected?.id === item.id && "bg-muted")}
              onClick={() => setSelectedMenuId(item.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{item.label}</p>
                <Badge variant={item.isVisible ? "default" : "outline"}>{item.isVisible ? "visible" : "hidden"}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.type} · {item.type === "EXTERNAL" ? item.url : item.targetValue || "built in"}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>
      <MenuEditor item={selected} onSave={saveMenuItem} onDelete={deleteMenuItem} />
    </div>
  );
}

function MenuEditor({ item, onSave, onDelete }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    setDraft(item ? { ...item } : null);
  }, [item]);

  if (!item || !draft) {
    return (
      <Card className="rounded-lg">
        <CardContent className="py-10 text-sm text-muted-foreground">No menu item selected.</CardContent>
      </Card>
    );
  }

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Edit Menu Item</CardTitle>
        <CardDescription>Page targets can point to About, Terms, Credits, or custom pages.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={(event) => {
          event.preventDefault();
          onSave(item.id, draft);
        }}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Label" value={draft.label} onChange={(value) => update("label", value)} />
              <TextField label="Position" value={String(draft.position || 0)} onChange={(value) => update("position", Number(value || 0))} type="number" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Type</FieldLabel>
                <AdminSelect value={draft.type} onValueChange={(value) => update("type", value)} options={menuTypes} />
              </Field>
              <TextField label="Target value" value={draft.targetValue} onChange={(value) => update("targetValue", value)} placeholder="about, terms, memory id, or query" />
            </div>
            <TextField label="External URL" value={draft.url} onChange={(value) => update("url", value)} placeholder="https://..." />
            <ToggleField label="Visible" description="Show in the public lower-right footer." checked={Boolean(draft.isVisible)} onCheckedChange={(value) => update("isVisible", value)} />
            <ToggleField label="Open in new tab" description="Applies to external links." checked={Boolean(draft.opensNewTab)} onCheckedChange={(value) => update("opensNewTab", value)} />
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              <Save data-icon="inline-start" />
              Save menu item
            </Button>
            <Button variant="destructive" type="button" onClick={() => onDelete(item.id)}>
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CommentsView({ data, search, updateCommentStatus }) {
  const comments = data.comments || [];
  const filtered = comments.filter((comment) => (
    containsQuery([
      comment.authorName,
      comment.authorEmail,
      comment.content,
      comment.memoryTitle,
      comment.status,
    ], search)
  ));

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
        <CardDescription>Moderate comments stored in the v1 backend.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comment</TableHead>
              <TableHead>Context</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!filtered.length ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={4}>No comments found.</TableCell>
              </TableRow>
            ) : null}
            {filtered.map((comment) => (
              <TableRow key={comment.id}>
                <TableCell>
                  <p className="font-medium">{comment.authorName || "Anonymous"}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{comment.content}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">{comment.memoryTitle || comment.memoryId || "General"}</TableCell>
                <TableCell><StatusBadge value={comment.status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => updateCommentStatus(comment.id, "NORMAL")}>
                      Approve
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => updateCommentStatus(comment.id, "REJECTED")}>
                      Reject
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => updateCommentStatus(comment.id, "ARCHIVED")}>
                      <Trash2 data-icon="inline-start" />
                      Archive
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AttachmentsView({ data, search, selectedMemoryId, uploadAttachment }) {
  const [memoryId, setMemoryId] = useState(String(selectedMemoryId || data.memories?.[0]?.id || ""));
  const attachments = (data.attachments || []).filter((attachment) => (
    containsQuery([attachment.imageKey, attachment.storageType, attachment.mimeType], search)
  ));
  const memoryOptions = (data.memories || []).map((memory) => ({
    value: String(memory.id),
    label: memory.title || memory.excerpt || `Memory ${memory.id}`,
  }));

  useEffect(() => {
    if (!memoryId && memoryOptions[0]?.value) setMemoryId(memoryOptions[0].value);
  }, [memoryId, memoryOptions]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-lg sm:col-span-2 xl:col-span-4">
        <CardHeader>
          <CardTitle>Upload attachment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field>
            <FieldLabel>Memory</FieldLabel>
            <AdminSelect value={memoryId} onValueChange={setMemoryId} options={memoryOptions} />
          </Field>
          <Button asChild disabled={!memoryId}>
            <label>
              <Upload data-icon="inline-start" />
              Upload image
              <input
                className="sr-only"
                type="file"
                disabled={!memoryId}
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && memoryId) uploadAttachment(file, memoryId);
                  event.target.value = "";
                }}
              />
            </label>
          </Button>
        </CardContent>
      </Card>
      {attachments.map((attachment) => (
        <Card key={attachment.imageKey} className="rounded-lg">
          <div className="aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: `url("${attachment.thumbUrl}")` }} />
          <CardHeader>
            <CardTitle className="truncate text-sm">{attachment.imageKey}</CardTitle>
            <CardDescription>{attachment.storageType} · {attachment.mimeType || "image"}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function ThemeView() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Admin uses shadcn/ui while preserving the public archive's black canvas and restrained typography.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="theme-preview rounded-lg border" />
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>Primary surface: dark archive canvas.</p>
            <p>Content surfaces: neutral shadcn cards, inputs, badges, tabs, tables, and switches.</p>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Responsive layout</CardTitle>
          <CardDescription>Desktop, tablet, and phone share the same admin modules with different navigation density.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <HealthRow label="Desktop" value="Sidebar workspace" />
          <HealthRow label="Tablet" value="Stacked editor panels" />
          <HealthRow label="Mobile" value="Compact top navigation" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MonitorSmartphone className="size-4" />
            Public frontend UI remains unchanged.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsView({ data, saveSettings, saveAccount, setupTwoFactor, enableTwoFactor, disableTwoFactor }) {
  const settings = data.settings || {};
  const account = settings.account || {};
  const [siteDraft, setSiteDraft] = useState(() => ({
    defaultLanguage: settings.defaultLanguage || "en",
    anonymousSubmissions: Boolean(settings.anonymousSubmissions),
    tracking: {
      enabled: Boolean(settings.tracking?.enabled),
      umamiSrc: settings.tracking?.umamiSrc || "",
      umamiWebsiteId: settings.tracking?.umamiWebsiteId || "",
    },
  }));
  const [accountDraft, setAccountDraft] = useState({
    email: account.email || "",
    currentPassword: "",
    newPassword: "",
  });
  const [twoFactor, setTwoFactor] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [disableCode, setDisableCode] = useState("");

  useEffect(() => {
    setSiteDraft({
      defaultLanguage: settings.defaultLanguage || "en",
      anonymousSubmissions: Boolean(settings.anonymousSubmissions),
      tracking: {
        enabled: Boolean(settings.tracking?.enabled),
        umamiSrc: settings.tracking?.umamiSrc || "",
        umamiWebsiteId: settings.tracking?.umamiWebsiteId || "",
      },
    });
    setAccountDraft((current) => ({ ...current, email: account.email || "" }));
  }, [settings.defaultLanguage, settings.anonymousSubmissions, settings.tracking, account.email]);

  const updateSite = (key, value) => setSiteDraft((current) => ({ ...current, [key]: value }));
  const updateTracking = (key, value) => setSiteDraft((current) => ({
    ...current,
    tracking: { ...current.tracking, [key]: value },
  }));
  const updateAccount = (key, value) => setAccountDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="size-4 text-muted-foreground" />
            Site settings
          </CardTitle>
          <CardDescription>Controls public defaults and analytics.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5" onSubmit={(event) => {
            event.preventDefault();
            saveSettings(siteDraft);
          }}>
            <FieldGroup>
              <Field>
                <FieldLabel>Default language</FieldLabel>
                <AdminSelect
                  value={siteDraft.defaultLanguage}
                  onValueChange={(value) => updateSite("defaultLanguage", value)}
                  options={[
                    { value: "en", label: "English" },
                    { value: "fr", label: "French" },
                    { value: "zh", label: "中文" },
                  ]}
                />
                <FieldDescription>Used for `/`, missing `ln`, and bare memory URLs.</FieldDescription>
              </Field>
              <ToggleField
                label="Anonymous submissions"
                description="Allow public visitors to submit memories without logging in."
                checked={siteDraft.anonymousSubmissions}
                onCheckedChange={(value) => updateSite("anonymousSubmissions", value)}
              />
              <ToggleField
                label="Umami tracking"
                description="Inject the configured self-hosted Umami script into public pages."
                checked={siteDraft.tracking.enabled}
                onCheckedChange={(value) => updateTracking("enabled", value)}
              />
              <TextField label="Umami script URL" value={siteDraft.tracking.umamiSrc} onChange={(value) => updateTracking("umamiSrc", value)} placeholder="https://umami.example.com/script.js" />
              <TextField label="Umami website ID" value={siteDraft.tracking.umamiWebsiteId} onChange={(value) => updateTracking("umamiWebsiteId", value)} />
            </FieldGroup>
            <Button className="w-fit" type="submit">
              <Save data-icon="inline-start" />
              Save settings
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            Admin account
          </CardTitle>
          <CardDescription>Password changes require the current password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5" onSubmit={(event) => {
            event.preventDefault();
            saveAccount(accountDraft);
            setAccountDraft((current) => ({ ...current, currentPassword: "", newPassword: "" }));
          }}>
            <FieldGroup>
              <TextField label="Admin email" value={accountDraft.email} onChange={(value) => updateAccount("email", value)} type="email" />
              <TextField label="Current password" value={accountDraft.currentPassword} onChange={(value) => updateAccount("currentPassword", value)} type="password" autoComplete="current-password" />
              <TextField label="New password" description="Leave blank to keep the current password." value={accountDraft.newPassword} onChange={(value) => updateAccount("newPassword", value)} type="password" autoComplete="new-password" />
            </FieldGroup>
            <Button className="w-fit" type="submit">
              <Save data-icon="inline-start" />
              Save account
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-lg xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            Two-factor authentication
          </CardTitle>
          <CardDescription>{account.twoFactorEnabled ? "A TOTP authenticator is required after password login." : "Add a TOTP authenticator to protect admin login."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {account.twoFactorEnabled ? (
            <form className="grid max-w-md gap-4" onSubmit={(event) => {
              event.preventDefault();
              disableTwoFactor({ totp: disableCode });
              setDisableCode("");
            }}>
              <TextField label="Authenticator code" value={disableCode} onChange={setDisableCode} inputMode="numeric" autoComplete="one-time-code" />
              <Button variant="outline" className="w-fit" type="submit">Disable 2FA</Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <Button className="w-fit" variant="outline" type="button" onClick={async () => {
                const setup = await setupTwoFactor();
                if (setup) setTwoFactor(setup);
              }}>
                Start 2FA setup
              </Button>
              {twoFactor ? (
                <form className="grid gap-4 rounded-lg border bg-background/45 p-4" onSubmit={(event) => {
                  event.preventDefault();
                  enableTwoFactor({ totp: twoFactorCode });
                  setTwoFactorCode("");
                }}>
                  <div className="grid gap-2 text-sm">
                    <span className="text-muted-foreground">Secret</span>
                    <code className="overflow-x-auto rounded border px-3 py-2">{twoFactor.secret}</code>
                    <span className="text-muted-foreground">otpauth URL</span>
                    <code className="overflow-x-auto rounded border px-3 py-2">{twoFactor.otpauthUrl}</code>
                  </div>
                  <TextField label="Authenticator code" value={twoFactorCode} onChange={setTwoFactorCode} inputMode="numeric" autoComplete="one-time-code" />
                  <Button className="w-fit" type="submit">Enable 2FA</Button>
                </form>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BackupsView({ exportBackup }) {
  const rows = [
    ["Application data", "memories, pages, menu, comments, settings"],
    ["Uploaded images", "local filesystem and v1 asset references"],
    ["Restore point", "Snapshot policy can be wired to the deployment target"],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="rounded-lg md:col-span-2">
        <CardHeader>
          <CardTitle>Export bundle</CardTitle>
          <CardDescription>Download the current admin archive data as JSON.</CardDescription>
          <CardAction>
            <Button onClick={exportBackup}>
              <Download data-icon="inline-start" />
              Download JSON
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
      {rows.map(([title, copy]) => (
        <Card key={title} className="rounded-lg">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{copy}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
