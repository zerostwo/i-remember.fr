import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Menu as MenuIcon,
  NotebookTabs,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@i-remember/ui";
import { cn } from "@/lib/utils";
import { v1AuthPayload } from "./v1-auth.js";
import { mergeV1Assets, v1AssetDeletePath, v1AssetUploadPayload } from "./v1-assets.js";
import {
  deleteV1MenuItem,
  syncV1MenuItem,
  syncV1Page,
  syncV1Settings,
  v1PageMemory,
} from "./v1-content.js";
import { archiveV1Memory, syncV1Memory } from "./v1-memory.js";

const routes = [
  {
    id: "dashboard",
    label: "Dashboard",
    title: "Dashboard",
    description: "A clear view of your memories and site health.",
    group: "Workspace",
    icon: LayoutDashboard,
  },
  {
    id: "memory",
    label: "Memories",
    title: "Memories",
    description: "Write, review, and publish every memory in one place.",
    group: "Workspace",
    icon: NotebookTabs,
  },
  {
    id: "memory-editor",
    label: "Memory editor",
    title: "New memory",
    description: "Unsaved · publishes immediately",
    group: "Workspace",
    icon: NotebookTabs,
    hidden: true,
  },
  {
    id: "pages",
    label: "Pages",
    title: "Pages",
    description: "Markdown pages that can appear in public navigation.",
    group: "Workspace",
    icon: FileText,
  },
  {
    id: "attachments",
    label: "Attachments",
    title: "Attachments",
    description: "Images and files attached to your memories.",
    group: "Workspace",
    icon: Paperclip,
  },
  {
    id: "menus",
    label: "Navigation",
    title: "Navigation",
    description: "Manage the public site’s lower-right navigation.",
    group: "Workspace",
    icon: MenuIcon,
  },
  {
    id: "settings",
    label: "Settings",
    title: "Settings",
    description: "Site defaults, owner identity, security, and recovery.",
    group: "System",
    icon: Settings,
  },
];

const routeMap = new Map(routes.map((route) => [route.id, route]));
const groupedRoutes = routes.reduce((groups, route) => {
  if (route.hidden) return groups;
  if (!groups.has(route.group)) groups.set(route.group, []);
  groups.get(route.group).push(route);
  return groups;
}, new Map());

const menuTypes = [
  "PAGE",
  "MEMORY",
  "SEARCH",
  "EXTERNAL",
  "GROUP",
  "TERMS",
  "CREDITS",
  "LANGUAGE",
  "SOUND",
  "SHARE",
  "LOGO",
];
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
  if (normalized === "/admin/memory/editor") return "memory-editor";
  if (!normalized.startsWith("/admin/")) return "dashboard";
  return normalizeRouteId(normalized.slice("/admin/".length));
}

function routeFromLocation() {
  return routeFromPathname();
}

function pathForRoute(routeId) {
  return `/admin/${normalizeRouteId(routeId)}`;
}

function memoryIdFromLocation() {
  return new URLSearchParams(window.location.search).get("id") || null;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(
      payload.error?.message ||
        payload.message ||
        payload.errorMsg ||
        `Request failed: ${response.status}`,
    );
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

async function rememberV1Token(credentials, options = {}) {
  const path = options.setup ? "/api/v1/auth/setup" : "/api/v1/auth/login";
  const session = await api(path, {
    method: "POST",
    body: JSON.stringify(v1AuthPayload(credentials, options)),
  });
  if (session.token) adminToken(session.token);
  return session;
}

function v1Status(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "NORMAL") return "published";
  if (normalized === "ARCHIVED") return "archived";
  if (normalized === "REJECTED") return "rejected";
  return "pending";
}

function metadataJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  return JSON.stringify(value, null, 2);
}

function v1MemoryAdmin(memory = {}) {
  const metadata = memory.metadata || {};
  const imageKey = metadata.imageKey || "revival-upload";
  const imageUrl = memory.attachments?.[0]?.url || `/uploads/posts/${imageKey}/resized.jpg`;
  return {
    id: memory.id,
    publicId: memory.id,
    title: memory.title,
    author: memory.authorName || "Songqi",
    authorName: memory.authorName || "Songqi",
    excerpt: memory.excerpt || String(memory.content || "").slice(0, 220),
    bodyMarkdown: memory.content || "",
    content: memory.content || "",
    language: metadata.language || "en",
    status: v1Status(memory.status),
    dbStatus: memory.status,
    source: metadata.source || "v1",
    imageKey,
    imageUrl,
    isLongForm: String(memory.content || "").length > 220,
    metadata: metadata,
    metadataJson: metadataJson(metadata),
    publicUrl: `/memory/${memory.id}`,
    viewCount: Number(memory.viewCount || 0),
    createdAt: memory.createdAt || "",
    updatedAt: memory.updatedAt || "",
  };
}

function v1PageAdmin(page = {}) {
  return {
    ...page,
    metadataJson: metadataJson(page.metadata),
  };
}

function v1MenuAdmin(item = {}) {
  return {
    ...item,
    parentId: String(item.metadata?.parentId || ""),
    metadataJson: metadataJson(item.metadata),
  };
}

function settingsFromV1(settings = {}, account = {}) {
  return {
    siteTitle: settings.siteTitle || "Songqi",
    canonicalUrl: settings.canonicalUrl || "https://songqi.org",
    timezone: settings.timezone || "Asia/Shanghai",
    defaultLanguage: settings.defaultLanguage || "en",
    anonymousSubmissions: settings.anonymousSubmissions === true,
    tracking: {
      enabled: Boolean(settings.tracking?.enabled),
      umamiSrc: settings.tracking?.umamiSrc || "",
      umamiWebsiteId: settings.tracking?.umamiWebsiteId || "",
    },
    account: {
      email: account.email || "",
      hasPassword: account.hasPassword !== false,
      twoFactorEnabled: Boolean(account.twoFactorEnabled),
    },
  };
}

async function v1Bootstrap() {
  const [dashboard, memories, pages, menu, settings, account, assets] = await Promise.all([
    v1Api("/api/v1/dashboard"),
    v1Api("/api/v1/memories?status=all&visibility=all&limit=200"),
    v1Api("/api/v1/pages"),
    v1Api("/api/v1/menu-items"),
    v1Api("/api/v1/settings"),
    v1Api("/api/v1/auth/account"),
    v1Api("/api/v1/assets").catch(() => []),
  ]);
  const payload = {
    language: settings.defaultLanguage || "en",
    counts: {
      totalMemory: dashboard.totalMemories,
      pendingMemory: dashboard.pendingMemories,
      publishedMemory: dashboard.publishedMemories,
      archivedMemory: dashboard.archivedMemories,
      rejectedMemory: dashboard.rejectedMemories,
      users: dashboard.totalUsers,
      pages: pages.length,
      menuItems: menu.length,
      attachments: assets.length,
    },
    memories: memories.map(v1MemoryAdmin),
    pages: pages.map(v1PageAdmin),
    menu: menu.map(v1MenuAdmin),
    attachments: [],
    settings: settingsFromV1(settings, account),
  };
  return mergeV1Assets(payload, assets);
}

function dataUrlBase64(value = "") {
  return String(value).includes(",") ? String(value).split(",").pop() : String(value);
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
  downloadBlob(filename, JSON.stringify(value, null, 2), "application/json");
}

function downloadText(filename, value) {
  downloadBlob(filename, value, "text/plain");
}

function downloadBlob(filename, value, type) {
  const blob = new Blob([value], { type });
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

function StatusBadge({ value }) {
  const status = String(value || "unknown").toLowerCase();
  const label = status === "pending" ? "draft" : status;
  return (
    <Badge variant="outline" className={cn("admin-status capitalize", `admin-status-${status}`)}>
      {label}
    </Badge>
  );
}

function AdminSelect({ value, onValueChange, options, placeholder, className, ariaLabel }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("w-full", className)} aria-label={ariaLabel}>
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
  const generatedId = useId();
  const { id: providedId, ...inputProps } = props;
  const inputId = providedId || generatedId;
  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input
        id={inputId}
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function TextareaField({ label, description, value, onChange, rows = 5, ...props }) {
  const generatedId = useId();
  const { id: providedId, ...textareaProps } = props;
  const inputId = providedId || generatedId;
  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Textarea
        id={inputId}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        {...textareaProps}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function ToggleField({ label, description, checked, onCheckedChange, className }) {
  return (
    <Field
      orientation="horizontal"
      className={cn("items-start justify-between rounded-lg border bg-card/40 p-3", className)}
    >
      <div className="space-y-1">
        <FieldLabel>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </Field>
  );
}

function TotpQrCode({ value }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: 192,
        margin: 2,
        color: { dark: "#111827", light: "#ffffff" },
      },
      () => {},
    );
  }, [value]);

  return (
    <div className="w-fit rounded-lg border bg-white p-3">
      <canvas ref={canvasRef} width="192" height="192" aria-label="Two-factor QR code" />
    </div>
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
  const [bootstrapTokenRequired, setBootstrapTokenRequired] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [route, setRoute] = useState(routeFromLocation);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [memoryFilter, setMemoryFilter] = useState("all");
  const [selectedMemoryId, setSelectedMemoryId] = useState(memoryIdFromLocation);
  const [selectedPageSlug, setSelectedPageSlug] = useState("");
  const [selectedMenuId, setSelectedMenuId] = useState(null);
  const [settingsTab, setSettingsTab] = useState("site");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("songqi-admin:sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const searchTriggerRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api("/api/v1/auth/status").catch(() => ({ needsSetup: false })),
      adminToken()
        ? v1Api("/api/v1/dashboard")
            .then(() => true)
            .catch(() => false)
        : false,
    ])
      .then(([status, hasSession]) => {
        if (active) {
          setNeedsSetup(Boolean(status.needsSetup));
          setBootstrapTokenRequired(Boolean(status.bootstrapTokenRequired));
          setAuthenticated(Boolean(hasSession));
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
      const payload = await v1Bootstrap();
      setData(payload);
      setSelectedMemoryId((current) => {
        const requested = memoryIdFromLocation();
        if (requested && payload.memories.some((memory) => memory.id === requested))
          return requested;
        return payload.memories.some((memory) => memory.id === current) ? current : null;
      });
      setSelectedPageSlug((current) =>
        payload.pages.some((page) => page.slug === current)
          ? current
          : payload.pages[0]?.slug || "",
      );
      setSelectedMenuId((current) =>
        payload.menu.some((item) => item.id === current) ? current : payload.menu[0]?.id || null,
      );
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchTriggerRef.current = document.activeElement;
        setSpotlightOpen(true);
      }
      if (event.key === "Escape") {
        setSpotlightOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function navigate(nextRoute) {
    const target = routeMap.has(nextRoute) ? nextRoute : "dashboard";
    const targetPath = pathForRoute(target);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ route: target }, "", targetPath);
    }
    setRoute(target);
    setMobileNavOpen(false);
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("songqi-admin:sidebar-collapsed", String(next));
      } catch {
        // Keep the in-memory preference when local storage is unavailable.
      }
      return next;
    });
  }

  function openSpotlight(trigger) {
    searchTriggerRef.current = trigger || document.activeElement;
    setSpotlightOpen(true);
  }

  function closeSpotlight() {
    setSpotlightOpen(false);
    window.setTimeout(() => searchTriggerRef.current?.focus?.(), 0);
  }

  async function handleLogin(credentials) {
    setLoading(true);
    setError("");
    try {
      const result = await rememberV1Token(credentials);
      if (result?.requiresTwoFactor) return result;
      const session = { authenticated: true };
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
      await rememberV1Token(credentials, { setup: true });
      const session = { authenticated: true };
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
      const saved = await syncV1Memory(v1Api, payload);
      setSelectedMemoryId(saved?.id || id);
      window.history.replaceState(
        { route: "memory-editor" },
        "",
        `/admin/memory/editor?id=${encodeURIComponent(saved?.id || id)}`,
      );
      setRoute("memory-editor");
      await refreshData();
    });
  }

  function createMemory() {
    setSelectedMemoryId(null);
    window.history.pushState({ route: "memory-editor" }, "", "/admin/memory/editor?new=1");
    setRoute("memory-editor");
  }

  function editMemory(id, section = "content") {
    setSelectedMemoryId(id);
    window.history.pushState(
      { route: "memory-editor" },
      "",
      `/admin/memory/editor?id=${encodeURIComponent(id)}&section=${encodeURIComponent(section)}`,
    );
    setRoute("memory-editor");
  }

  async function deleteMemory(id) {
    const memory = data?.memories?.find((item) => item.id === id);
    if (!memory || !window.confirm(`Archive "${memory.title || memory.excerpt || "this memory"}"?`))
      return;
    await runAction("Memory archived", async () => {
      await archiveV1Memory(v1Api, memory);
      await refreshData();
    });
  }

  async function uploadAttachment(file, memoryId) {
    const memory = data?.memories?.find((item) => String(item.id) === String(memoryId));
    if (!file || !memory) return;
    await runAction("Attachment uploaded", async () => {
      const synced = await syncV1Memory(v1Api, memory);
      if (!synced?.id) throw new Error("Memory could not be synced to v1 before upload");
      const contentBase64 = dataUrlBase64(await readFileAsDataUrl(file));
      await v1Api("/api/v1/assets", {
        method: "POST",
        body: JSON.stringify(v1AssetUploadPayload(file, contentBase64, synced.id)),
      });
      await refreshData();
    });
  }

  async function deleteAttachment(attachment) {
    if (!attachment || attachment.storageType !== "v1") return;
    if (!window.confirm(`Delete "${attachment.imageKey || "this attachment"}"?`)) return;
    await runAction("Attachment deleted", async () => {
      await v1Api(v1AssetDeletePath(attachment), { method: "DELETE" });
      await refreshData();
    });
  }

  async function savePage(slug, payload) {
    await runAction("Page saved", async () => {
      let saved = await syncV1Page(v1Api, { ...payload, originalSlug: slug });
      let pageMemory = v1PageMemory(saved);
      if (!pageMemory && saved.status === "PUBLISHED") {
        const memory = await syncV1Memory(v1Api, {
          language: saved.language,
          source: "page",
          title: saved.title,
          author: "Songqi",
          excerpt: saved.excerpt,
          bodyMarkdown: saved.bodyMarkdown,
          status: "published",
          tags: [saved.slug, "page", "memory"],
        });
        saved = await syncV1Page(v1Api, {
          ...saved,
          originalSlug: saved.slug,
          linkedMemoryId: memory.id,
        });
        pageMemory = v1PageMemory(saved);
      }
      if (pageMemory) await syncV1Memory(v1Api, pageMemory);
      setSelectedPageSlug(saved.slug);
      await refreshData();
    });
  }

  async function createPage() {
    await runAction("Page created", async () => {
      const slug = `page-${Date.now().toString(36)}`;
      const saved = await syncV1Page(v1Api, {
        slug,
        title: "Untitled page",
        excerpt: "A new footer page.",
        status: "DRAFT",
        bodyMarkdown: "# Untitled page\n\nWrite this page in Markdown.",
      });
      const pageMemory = v1PageMemory(saved);
      if (pageMemory) await syncV1Memory(v1Api, pageMemory).catch(() => null);
      setSelectedPageSlug(saved.slug);
      await refreshData();
    });
  }

  async function saveMenuItem(id, payload) {
    await runAction("Menu item saved", async () => {
      const saved = await syncV1MenuItem(v1Api, payload);
      setSelectedMenuId(saved.id);
      await refreshData();
    });
  }

  async function createMenuItem() {
    await runAction("Menu item created", async () => {
      const saved = await syncV1MenuItem(v1Api, {
        uid: `menu-${Date.now().toString(36)}`,
        label: "New item",
        type: "PAGE",
        targetValue: data?.pages?.[0]?.slug || "about",
        position: (data?.menu?.at(-1)?.position || 0) + 10,
        isVisible: true,
      });
      setSelectedMenuId(saved.id);
      await refreshData();
    });
  }

  async function deleteMenuItem(id) {
    const item = data?.menu?.find((candidate) => candidate.id === id);
    await runAction("Menu item deleted", async () => {
      if (item) await deleteV1MenuItem(v1Api, item);
      setSelectedMenuId(null);
      await refreshData();
    });
  }

  async function saveSettings(payload) {
    await runAction("Settings saved", async () => {
      const settings = await syncV1Settings(v1Api, payload);
      setData((current) =>
        current ? { ...current, settings: { ...current.settings, ...settings } } : current,
      );
    });
  }

  async function saveAccount(payload) {
    return runAction("Account updated", async () => {
      const result = await v1Api("/api/v1/auth/account", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (result.token) adminToken(result.token);
      setData((current) =>
        current
          ? {
              ...current,
              settings: {
                ...current.settings,
                account: {
                  ...(current.settings?.account || {}),
                  ...(result.account || {}),
                },
              },
            }
          : current,
      );
      return result;
    });
  }

  async function exportBackup() {
    await runAction("Backup exported", async () => {
      const bundle = {
        generatedAt: new Date().toISOString(),
        format: "i-remember-v1-export",
        data,
      };
      const stamp = String(bundle.generatedAt).slice(0, 10);
      downloadJson(`i-remember-backup-${stamp}.json`, bundle);
    });
  }

  async function setupTwoFactor(payload) {
    return runAction("Two-factor setup created", () =>
      v1Api("/api/v1/auth/2fa/setup", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      }),
    );
  }

  async function enableTwoFactor(payload) {
    return runAction("Two-factor enabled", async () => {
      const result = await v1Api("/api/v1/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setData((current) =>
        current
          ? {
              ...current,
              settings: {
                ...current.settings,
                account: {
                  ...(current.settings?.account || {}),
                  ...(result.account || {}),
                },
              },
            }
          : current,
      );
      return result;
    });
  }

  async function disableTwoFactor(payload) {
    return runAction("Two-factor disabled", async () => {
      const result = await v1Api("/api/v1/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setData((current) =>
        current
          ? {
              ...current,
              settings: {
                ...current.settings,
                account: {
                  ...(current.settings?.account || {}),
                  ...(result.account || {}),
                },
              },
            }
          : current,
      );
      return result;
    });
  }

  const currentRoute = routeMap.get(route) || routeMap.get("dashboard");
  const activeRoute = route === "memory-editor" ? "memory" : route;

  if (checkingSession) {
    return (
      <main className="i-remember-admin dark grid min-h-screen place-items-center bg-background p-4 text-foreground">
        <LoadingState />
      </main>
    );
  }

  if (!authenticated) {
    if (needsSetup) {
      return (
        <SetupScreen
          bootstrapTokenRequired={bootstrapTokenRequired}
          loading={loading}
          onSetup={handleSetup}
        />
      );
    }
    return <LoginScreen loading={loading} onLogin={handleLogin} />;
  }

  return (
    <main className="i-remember-admin dark min-h-screen bg-background text-foreground">
      <div className={cn("admin-shell", sidebarCollapsed && "is-collapsed")}>
        <AdminSidebar
          route={activeRoute}
          navigate={navigate}
          collapsed={sidebarCollapsed}
          toggleCollapsed={toggleSidebar}
          openSearch={openSpotlight}
          onLogout={handleLogout}
        />
        <section className="admin-main min-w-0">
          <header className="admin-topbar">
            <button
              className="admin-mobile-menu"
              aria-label="Open navigation"
              type="button"
              onClick={() => setMobileNavOpen(true)}
            >
              <MenuIcon />
            </button>
            <div className="admin-page-heading min-w-0">
              <h1>{currentRoute.title}</h1>
              <p>{currentRoute.description}</p>
            </div>
            <TopBarAction
              route={route}
              settingsTab={settingsTab}
              createMemory={createMemory}
              createPage={createPage}
              createMenuItem={createMenuItem}
              exportBackup={exportBackup}
            />
          </header>

          <div className="admin-content">
            {error ? <StatusMessage variant="error" message={error} /> : null}
            {notice ? <StatusMessage message={notice} /> : null}
            {loading && !data ? <LoadingState /> : null}
            {data ? (
              <AdminRoute
                route={route}
                data={data}
                search={search}
                setSearch={setSearch}
                memoryFilter={memoryFilter}
                setMemoryFilter={setMemoryFilter}
                selectedMemoryId={selectedMemoryId}
                setSelectedMemoryId={setSelectedMemoryId}
                selectedPageSlug={selectedPageSlug}
                setSelectedPageSlug={setSelectedPageSlug}
                selectedMenuId={selectedMenuId}
                setSelectedMenuId={setSelectedMenuId}
                settingsTab={settingsTab}
                setSettingsTab={setSettingsTab}
                createMemory={createMemory}
                editMemory={editMemory}
                saveMemory={saveMemory}
                deleteMemory={deleteMemory}
                uploadAttachment={uploadAttachment}
                deleteAttachment={deleteAttachment}
                createPage={createPage}
                savePage={savePage}
                createMenuItem={createMenuItem}
                saveMenuItem={saveMenuItem}
                deleteMenuItem={deleteMenuItem}
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
      <MobileNavigationSheet
        open={mobileNavOpen}
        route={activeRoute}
        navigate={navigate}
        openSearch={openSpotlight}
        close={() => setMobileNavOpen(false)}
        onLogout={handleLogout}
      />
      <Spotlight
        open={spotlightOpen}
        data={data}
        close={closeSpotlight}
        navigate={navigate}
        createMemory={createMemory}
        createPage={createPage}
        editMemory={editMemory}
      />
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
    <main className="i-remember-admin admin-auth dark min-h-screen bg-background text-foreground">
      <section className="admin-auth-brand">
        <strong>songqi.org</strong>
        <div>
          <h1>
            A private control room
            <br />
            for a public memory blog.
          </h1>
          <p>The public site remains open for anonymous New Memory submissions.</p>
        </div>
        <small>PERSONAL BLOG · SONGQI DUAN</small>
      </section>
      <section className="admin-auth-panel">
        <Card className="admin-auth-card">
          <CardHeader>
            <CardTitle>Owner sign in</CardTitle>
            <CardDescription>Only the site owner can access this admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={submitLogin}>
              <FieldGroup>
                <TextField
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="username"
                />
                <TextField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  autoComplete="current-password"
                />
                {requiresTwoFactor ? (
                  <TextField
                    label="Two-factor or recovery code"
                    value={totp}
                    onChange={setTotp}
                    inputMode="text"
                    autoComplete="one-time-code"
                  />
                ) : null}
              </FieldGroup>
              {loginError ? <StatusMessage variant="error" message={loginError} /> : null}
              <Button className="w-full" disabled={loading} type="submit" size="lg">
                Sign in
              </Button>
              {!requiresTwoFactor ? (
                <button
                  className="admin-auth-recovery"
                  type="button"
                  onClick={() => {
                    setRequiresTwoFactor(true);
                    setTotp("");
                  }}
                >
                  Use a recovery code
                </button>
              ) : (
                <p className="admin-auth-recovery">A recovery code works in this field too.</p>
              )}
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function SetupScreen({ bootstrapTokenRequired, loading, onSetup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [setupError, setSetupError] = useState("");

  async function submitSetup(event) {
    event.preventDefault();
    setSetupError("");
    if (password !== confirmPassword) {
      setSetupError("Passwords do not match");
      return;
    }
    try {
      await onSetup({ email, password, bootstrapToken });
    } catch (error) {
      setSetupError(error.message);
    }
  }

  return (
    <main className="i-remember-admin admin-auth dark min-h-screen bg-background text-foreground">
      <section className="admin-auth-brand">
        <strong>songqi.org</strong>
        <div>
          <h1>
            A private control room
            <br />
            for a public memory blog.
          </h1>
          <p>The public site remains open for anonymous New Memory submissions.</p>
        </div>
        <small>PERSONAL BLOG · SONGQI DUAN</small>
      </section>
      <section className="admin-auth-panel">
        <Card className="admin-auth-card admin-auth-card-setup">
          <CardHeader>
            <CardTitle>Set up songqi.org</CardTitle>
            <CardDescription>
              Create the single owner account for this installation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={submitSetup}>
              <FieldGroup>
                <TextField
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="username"
                />
                <TextField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  autoComplete="new-password"
                />
                <TextField
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  type="password"
                  autoComplete="new-password"
                />
                {bootstrapTokenRequired ? (
                  <TextField
                    label="One-time setup token"
                    description="Read this value from the protected setup-token file in the server data directory."
                    value={bootstrapToken}
                    onChange={setBootstrapToken}
                    type="password"
                    autoComplete="off"
                    required
                  />
                ) : null}
              </FieldGroup>
              {setupError ? <StatusMessage variant="error" message={setupError} /> : null}
              <Button className="w-full" disabled={loading} type="submit" size="lg">
                Create owner account
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function TopBarAction({
  route,
  settingsTab,
  createMemory,
  createPage,
  createMenuItem,
  exportBackup,
}) {
  if (route === "memory-editor") {
    return (
      <div className="admin-topbar-actions">
        <Button
          variant="outline"
          form="memory-editor-form"
          name="intent"
          value="draft"
          type="submit"
        >
          Save draft
        </Button>
        <Button form="memory-editor-form" name="intent" value="publish" type="submit">
          Publish memory
        </Button>
      </div>
    );
  }
  if (route === "pages") {
    return (
      <Button onClick={createPage}>
        <Plus data-icon="inline-start" />
        New page
      </Button>
    );
  }
  if (route === "menus") {
    return (
      <Button onClick={createMenuItem}>
        <Plus data-icon="inline-start" />
        New item
      </Button>
    );
  }
  if (route === "attachments") return null;
  if (route === "settings") {
    if (settingsTab === "backup") {
      return (
        <Button variant="outline" type="button" onClick={exportBackup}>
          <Download data-icon="inline-start" />
          Export content
        </Button>
      );
    }
    if (settingsTab === "security") return null;
    return (
      <Button variant="outline" form={`settings-${settingsTab}-form`} type="submit">
        {settingsTab === "account" ? "Save account" : "Save changes"}
      </Button>
    );
  }
  return (
    <Button onClick={createMemory}>
      <Plus data-icon="inline-start" />
      New memory
    </Button>
  );
}

function AdminSidebar({ route, navigate, collapsed, toggleCollapsed, openSearch, onLogout }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-inner">
        <button
          className="admin-brand"
          onClick={() => navigate("dashboard")}
          type="button"
          title="songqi.org"
        >
          <span className="admin-brand-name">{collapsed ? "S" : "songqi.org"}</span>
          {!collapsed ? <span className="admin-brand-role">private admin</span> : null}
        </button>
        <button
          className="admin-search-trigger"
          onClick={(event) => openSearch(event.currentTarget)}
          type="button"
          aria-label="Search admin"
          title={collapsed ? "Search" : undefined}
        >
          <Search />
          {!collapsed ? (
            <>
              <span>Search</span>
              <kbd>⌘K</kbd>
            </>
          ) : null}
        </button>
        <nav className="admin-nav" aria-label="Admin sections">
          {[...groupedRoutes.entries()].map(([group, groupRoutes]) => (
            <div key={group} className="admin-nav-group">
              {!collapsed ? <p>{group}</p> : null}
              {groupRoutes.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={route === item.id}
                  collapsed={collapsed}
                  onClick={() => navigate(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          {!collapsed ? (
            <a className="admin-site-link" href="/" target="_blank" rel="noreferrer">
              View songqi.org <ExternalLink />
            </a>
          ) : null}
          <button
            className="admin-collapse"
            onClick={toggleCollapsed}
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed ? <span>Collapse sidebar</span> : null}
          </button>
          <button
            className="admin-owner"
            onClick={onLogout}
            type="button"
            title={collapsed ? "Songqi Duan · Sign out" : "Sign out"}
          >
            <span className="admin-avatar">SD</span>
            {!collapsed ? (
              <>
                <span className="admin-owner-copy">
                  <strong>Songqi Duan</strong>
                  <small>Owner</small>
                </span>
              </>
            ) : null}
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileNavigationSheet({ open, route, navigate, openSearch, close, onLogout }) {
  if (!open) return null;
  return (
    <div
      className="admin-mobile-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside className="admin-mobile-sheet" aria-label="Mobile admin navigation">
        <div className="admin-mobile-brand">
          <div>
            <strong>songqi.org</strong>
            <span>private admin</span>
          </div>
          <button type="button" onClick={close} aria-label="Close navigation">
            <X />
          </button>
        </div>
        <button
          className="admin-mobile-search"
          type="button"
          onClick={(event) => {
            close();
            openSearch(event.currentTarget);
          }}
        >
          <Search />
          <span>Search anything</span>
          <kbd>⌘K</kbd>
        </button>
        <nav className="admin-nav">
          {[...groupedRoutes.entries()].map(([group, groupRoutes]) => (
            <div key={group} className="admin-nav-group">
              <p>{group === "Workspace" ? "Content" : group}</p>
              {groupRoutes.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={route === item.id}
                  onClick={() => navigate(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>
        <button className="admin-owner" type="button" onClick={onLogout}>
          <span className="admin-avatar">SD</span>
          <span className="admin-owner-copy">
            <strong>Songqi Duan</strong>
            <small>Owner</small>
          </span>
          <span className="admin-signout">Sign out</span>
        </button>
      </aside>
    </div>
  );
}

function NavButton({ item, active, collapsed = false, onClick }) {
  return (
    <button
      className={cn("admin-nav-button", active && "is-active")}
      onClick={onClick}
      type="button"
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
    >
      <item.icon />
      {!collapsed ? <span>{item.label}</span> : null}
    </button>
  );
}

function Spotlight({ open, data, close, navigate, createMemory, createPage, editMemory }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (value) =>
    !normalizedQuery ||
    String(value || "")
      .toLowerCase()
      .includes(normalizedQuery);
  const results = [
    { group: "Quick actions", label: "New memory", meta: "N", action: createMemory },
    { group: "Quick actions", label: "Create page", meta: "P", action: createPage },
    ...(data?.memories || [])
      .filter((memory) => matches(`${memory.title} ${memory.excerpt} ${memory.author}`))
      .slice(0, normalizedQuery ? 6 : 2)
      .map((memory) => ({
        group: "Memories",
        label: memory.title || memory.excerpt,
        meta: memory.createdAt
          ? new Date(memory.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          : "",
        action: () => editMemory(memory.id),
      })),
    ...(data?.pages || [])
      .filter((page) => matches(`${page.title} ${page.slug}`))
      .slice(0, normalizedQuery ? 4 : 0)
      .map((page) => ({
        group: "Pages",
        label: page.title,
        meta: page.slug,
        action: () => navigate("pages"),
      })),
    { group: "Navigation", label: "Open Settings", meta: "S", action: () => navigate("settings") },
    {
      group: "Navigation",
      label: "View songqi.org",
      meta: "↗",
      action: () => window.open("/", "_blank", "noopener"),
    },
  ].filter((result) => result.group !== "Quick actions" || matches(result.label));

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const runResult = (result) => {
    close();
    result?.action?.();
  };

  return (
    <div
      className="admin-spotlight-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className="admin-spotlight"
        role="dialog"
        aria-modal="true"
        aria-label="Search admin content"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((index) => (index + 1) % Math.max(results.length, 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex(
              (index) => (index - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1),
            );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            runResult(results[selectedIndex]);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className="admin-spotlight-input">
          <Search />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memories, pages, or actions…"
            aria-label="Search memories, pages, or actions"
          />
          <button type="button" onClick={close}>
            esc
          </button>
        </div>
        <p className="admin-spotlight-hint">Type to search · ↑↓ to move · ↵ to open</p>
        <div className="admin-spotlight-results">
          {[...new Set(results.map((result) => result.group))].map((group) => (
            <div className="admin-spotlight-group" key={group}>
              <p>{group}</p>
              {results.map((result, index) =>
                result.group === group ? (
                  <button
                    key={`${group}-${result.label}`}
                    className={selectedIndex === index ? "is-selected" : ""}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => runResult(result)}
                  >
                    <span>{result.label}</span>
                    <small>{result.meta}</small>
                  </button>
                ) : null,
              )}
            </div>
          ))}
        </div>
        <footer>
          <span>{results.length} results</span>
          <span>Searches your admin content only</span>
        </footer>
      </section>
    </div>
  );
}

function StatusMessage({ message, variant = "success" }) {
  return (
    <div
      className={cn(
        "mb-4 rounded-lg border px-3 py-2 text-sm",
        variant === "error" ? "border-destructive/40 text-destructive" : "text-muted-foreground",
      )}
    >
      {message}
    </div>
  );
}

function LoadingState() {
  return (
    <Card className="rounded-lg">
      <CardContent className="py-10 text-sm text-muted-foreground">
        Loading admin data...
      </CardContent>
    </Card>
  );
}

function AdminRoute(props) {
  switch (props.route) {
    case "memory":
      return <MemoryView {...props} />;
    case "memory-editor":
      return <MemoryEditorView {...props} />;
    case "pages":
      return <PagesView {...props} />;
    case "attachments":
      return (
        <AttachmentsView
          data={props.data}
          search={props.search}
          selectedMemoryId={props.selectedMemoryId}
          uploadAttachment={props.uploadAttachment}
          deleteAttachment={props.deleteAttachment}
        />
      );
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
          settingsTab={props.settingsTab}
          setSettingsTab={props.setSettingsTab}
        />
      );
    default:
      return (
        <DashboardView
          data={props.data}
          navigate={props.navigate}
          createMemory={props.createMemory}
          createPage={props.createPage}
          editMemory={props.editMemory}
        />
      );
  }
}

function DashboardView({ data, navigate, createMemory, createPage, editMemory }) {
  const counts = data.counts || {};
  const queue = data.memories.slice(0, 5);
  const settings = data.settings || {};
  const published = Number(counts.publishedMemory || 0);
  const submissions = settings.anonymousSubmissions ? "On" : "Off";
  const submissionDetail = settings.anonymousSubmissions
    ? "Publishes immediately"
    : "Public form is closed";

  return (
    <div className="admin-dashboard">
      <p className="admin-section-label">At a glance</p>
      <div className="admin-metrics">
        <MetricCard
          label="Published memories"
          value={published}
          detail={`${counts.pendingMemory || 0} waiting or in draft`}
          tone="success"
        />
        <MetricCard
          label="Anonymous submissions"
          value={submissions}
          detail={submissionDetail}
          tone="blue"
        />
        <MetricCard
          label="Backup snapshot"
          value="Manual"
          detail="Export from Settings → Backup"
          tone="amber"
        />
      </div>
      <div className="admin-dashboard-grid">
        <Card className="admin-recent-card">
          <CardHeader>
            <CardTitle>Recent memories</CardTitle>
            <CardDescription>
              Open an entry to edit. Long-form behavior is automatic.
            </CardDescription>
            <CardAction>
              <Button variant="outline" onClick={() => navigate("memory")}>
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="admin-recent-head">
              <span>Title</span>
              <span>Status</span>
              <span>Updated</span>
            </div>
            <div className="admin-recent-list">
              {queue.length ? (
                queue.map((memory) => (
                  <button
                    className="admin-recent-row"
                    key={memory.id}
                    type="button"
                    onClick={() => editMemory(memory.id)}
                  >
                    <span>
                      <strong>{memory.title || memory.excerpt}</strong>
                      <small>Edited by {memory.author || "Songqi"}</small>
                    </span>
                    <StatusBadge value={memory.status} />
                    <time>
                      {memory.updatedAt
                        ? new Date(memory.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </time>
                  </button>
                ))
              ) : (
                <p className="admin-empty">No memories yet. Start with your first note.</p>
              )}
            </div>
          </CardContent>
        </Card>
        <aside className="admin-dashboard-rail">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="admin-quick-actions">
              <button type="button" onClick={createMemory}>
                <span>Write a memory</span>
                <small>New entry</small>
              </button>
              <button type="button" onClick={createPage}>
                <span>Create a page</span>
                <small>Markdown page</small>
              </button>
              <a href="/" target="_blank" rel="noreferrer">
                <span>Open public site</span>
                <small>songqi.org ↗</small>
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
            </CardHeader>
            <CardContent className="admin-attention">
              {!settings.tracking?.enabled ? (
                <button type="button" onClick={() => navigate("settings")}>
                  <strong>Connect self-hosted Umami</strong>
                  <span>Open Site settings →</span>
                </button>
              ) : (
                <p className="admin-ok">Umami analytics is connected.</p>
              )}
              <button type="button" onClick={() => navigate("settings")}>
                <strong>Verify your latest export can restore</strong>
                <span>Open Backup settings →</span>
              </button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Public submissions</CardTitle>
              <CardAction>
                <span className={settings.anonymousSubmissions ? "admin-ok" : "admin-muted"}>
                  {settings.anonymousSubmissions ? "Enabled" : "Disabled"}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="admin-submission-copy">
              <p>
                {settings.anonymousSubmissions
                  ? "Visitors can add a memory without signing in. New submissions publish immediately unless you change their status."
                  : "The anonymous New Memory form is currently unavailable to visitors."}
              </p>
              <button type="button" onClick={() => navigate("settings")}>
                Review submission settings →
              </button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone }) {
  return (
    <Card className="admin-metric-card">
      <CardContent>
        <span>{label}</span>
        <strong>{value}</strong>
        <small className={`tone-${tone}`}>{detail}</small>
      </CardContent>
    </Card>
  );
}

function MemoryView({ data, search, setSearch, memoryFilter, setMemoryFilter, editMemory }) {
  const [page, setPage] = useState(1);
  const memories = data.memories || [];
  const filtered = memories.filter((memory) => {
    const matchesFilter =
      memoryFilter === "all" ||
      (memoryFilter === "long" && memory.isLongForm) ||
      memory.status === memoryFilter;
    return (
      matchesFilter &&
      containsQuery(
        [memory.title, memory.author, memory.excerpt, memory.status, memory.source],
        search,
      )
    );
  });
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, memoryFilter]);

  return (
    <div className="grid gap-5">
      <Card className="admin-list-card">
        <CardContent className="grid gap-4">
          <div className="admin-list-toolbar">
            <Tabs value={memoryFilter} onValueChange={setMemoryFilter}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Draft</TabsTrigger>
                <TabsTrigger value="published">Published</TabsTrigger>
                <TabsTrigger value="long">Long form</TabsTrigger>
                <TabsTrigger value="archived">Archived</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="admin-inline-search">
              <Search />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search memories"
                type="search"
              />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Memory</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">More</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((memory) => (
                <TableRow key={memory.id}>
                  <TableCell className="min-w-72">
                    <MemoryListItem memory={memory} compact />
                  </TableCell>
                  <TableCell>{memory.author}</TableCell>
                  <TableCell>{memory.viewCount || 0}</TableCell>
                  <TableCell>
                    <StatusBadge value={memory.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {memory.updatedAt ? new Date(memory.updatedAt).toLocaleDateString() : "--"}
                  </TableCell>
                  <TableCell className="text-right">
                    <details className="relative inline-block text-left">
                      <summary className="cursor-pointer list-none rounded-md border px-3 py-1.5 text-xs">
                        More
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 grid min-w-36 gap-1 rounded-md border bg-popover p-1 shadow-lg">
                        <button
                          className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          type="button"
                          onClick={() => editMemory(memory.id)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          type="button"
                          onClick={() => editMemory(memory.id, "settings")}
                        >
                          Settings
                        </button>
                        <button
                          className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                          type="button"
                          onClick={() =>
                            navigator.clipboard?.writeText(
                              `${window.location.origin}${memory.publicUrl}`,
                            )
                          }
                        >
                          Copy share link
                        </button>
                        <a
                          className="rounded px-2 py-1.5 text-sm hover:bg-muted"
                          href={memory.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open public
                        </a>
                      </div>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-2 border-t pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}-
              {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MemoryEditorView({ data, selectedMemoryId, saveMemory, deleteMemory, navigate }) {
  const memory = (data.memories || []).find((item) => item.id === selectedMemoryId);
  const isNew = !selectedMemoryId;
  const draft =
    memory ||
    (isNew
      ? {
          id: null,
          title: "",
          author: "Songqi Duan",
          excerpt: "",
          bodyMarkdown: "",
          status: "published",
          imageKey: "",
          metadataJson: "{}",
          publicUrl: "",
        }
      : null);
  return (
    <MemoryEditor
      memory={draft}
      isNew={isNew}
      onSave={saveMemory}
      onDelete={deleteMemory}
      navigate={navigate}
    />
  );
}

function MemoryListItem({ memory, compact = false }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        !compact && "rounded-lg border bg-background/40 p-3",
      )}
    >
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

function MemoryEditor({ memory, isNew = false, onSave, onDelete, navigate }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    setDraft(memory ? { ...memory } : null);
  }, [memory]);

  if (!memory || !draft) {
    return (
      <Card className="rounded-lg">
        <CardContent className="py-10 text-sm text-muted-foreground">
          No memory selected.
        </CardContent>
      </Card>
    );
  }

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const previewText = String(draft.excerpt || draft.bodyMarkdown || "")
    .replace(/[#*_>`[\]()~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const previewTitle = draft.title || "Untitled memory";

  return (
    <form
      id="memory-editor-form"
      className="admin-editor-grid"
      onSubmit={(event) => {
        event.preventDefault();
        const intent = event.nativeEvent.submitter?.value;
        onSave(memory.id, {
          ...draft,
          status:
            intent === "draft" ? "pending" : intent === "publish" ? "published" : draft.status,
        });
      }}
    >
      <Card className="admin-editor-form">
        <CardHeader>
          <CardTitle>Content</CardTitle>
          <CardAction>
            <span className="admin-card-meta">Markdown</span>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FieldGroup>
            <TextField
              label="Title"
              description="Shown in admin lists and search results."
              value={draft.title}
              onChange={(value) => update("title", value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Author display name"
                value={draft.author}
                onChange={(value) => update("author", value)}
              />
              <Field>
                <FieldLabel>Status</FieldLabel>
                <AdminSelect
                  ariaLabel="Status"
                  value={draft.status}
                  onValueChange={(value) => update("status", value)}
                  options={memoryStatuses}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Public ID"
                value={draft.publicId || "Created after first save"}
                onChange={() => {}}
                disabled
              />
              <Field>
                <FieldLabel>Language</FieldLabel>
                <AdminSelect
                  ariaLabel="Language"
                  value={draft.language || "en"}
                  onValueChange={(value) => update("language", value)}
                  options={[
                    { value: "en", label: "Site default · English" },
                    { value: "fr", label: "French" },
                    { value: "zh", label: "中文" },
                  ]}
                />
              </Field>
            </div>
            <TextareaField
              className="admin-markdown-textarea"
              label="Body"
              value={draft.bodyMarkdown}
              onChange={(value) => update("bodyMarkdown", value)}
              rows={16}
            />
          </FieldGroup>
          <button
            className="admin-attachment-action"
            type="button"
            onClick={() => navigate("attachments")}
          >
            <strong>Add image or attachment</strong>
            <span>JPG, PNG, WebP · uploaded to your storage</span>
          </button>
          <div className="admin-editor-actions">
            {!isNew ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onDelete(memory.id)}
                disabled={draft.status === "archived"}
              >
                <Trash2 data-icon="inline-start" />
                Archive memory
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card className="admin-public-preview">
        <CardHeader>
          <CardTitle>Public preview</CardTitle>
          <CardAction>
            <span className="admin-card-meta">Card + Read more</span>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <article className="admin-memory-preview-card">
            <time>
              {new Date(memory.createdAt || Date.now())
                .toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
                .toUpperCase()}
            </time>
            <h2>{previewTitle}</h2>
            <p>
              {previewText
                ? `${previewText.slice(0, 145)}${previewText.length > 145 ? "…" : ""}`
                : "Your memory preview will appear here."}
            </p>
            {previewText.length > 220 ? <span className="admin-read-more">Read more</span> : null}
            <small>{draft.author || "Songqi Duan"}</small>
          </article>
          <div className="admin-preview-note">
            <strong>Long-form is automatic</strong>
            <p>
              When body content exceeds the public card preview, Read more appears and opens
              /memory/:public-id.
            </p>
          </div>
          <div className="admin-preview-route">
            <span>Public route</span>
            <strong>
              {draft.publicId ? `/memory/${draft.publicId}` : "Created after first save"}
            </strong>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function PagesView({ data, search, selectedPageSlug, setSelectedPageSlug, createPage, savePage }) {
  const pages = data.pages || [];
  const filtered = pages.filter((page) =>
    containsQuery([page.title, page.slug, page.excerpt, page.status], search),
  );
  const selected = pages.find((page) => page.slug === selectedPageSlug) || filtered[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.75fr)_minmax(560px,1.25fr)]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Pages</CardTitle>
          <CardDescription>
            Published pages are mirrored into long-form Memory entries.
          </CardDescription>
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
              className={cn(
                "rounded-lg border bg-background/40 p-3 text-left transition hover:bg-muted/50",
                selected?.slug === page.slug && "bg-muted",
              )}
              onClick={() => setSelectedPageSlug(page.slug)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{page.title}</p>
                <StatusBadge value={page.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                /{page.slug} · {page.excerpt || "No excerpt"}
              </p>
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
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(page.slug, draft);
          }}
        >
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Slug"
                value={draft.slug}
                onChange={(value) => update("slug", value)}
              />
              <Field>
                <FieldLabel>Status</FieldLabel>
                <AdminSelect
                  ariaLabel="Status"
                  value={draft.status}
                  onValueChange={(value) => update("status", value)}
                  options={pageStatuses}
                />
              </Field>
            </div>
            <TextField
              label="Title"
              value={draft.title}
              onChange={(value) => update("title", value)}
            />
            <TextareaField
              label="Excerpt"
              value={draft.excerpt}
              onChange={(value) => update("excerpt", value)}
              rows={3}
            />
            <TextareaField
              label="Metadata JSON"
              value={draft.metadataJson}
              onChange={(value) => update("metadataJson", value)}
              rows={5}
            />
            <TextareaField
              className="admin-markdown-textarea"
              label="Page Markdown"
              description="Use pages for About, Resume, Terms, and other footer menu articles."
              value={draft.bodyMarkdown}
              onChange={(value) => update("bodyMarkdown", value)}
              rows={16}
            />
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

function MenusView({
  data,
  search,
  selectedMenuId,
  setSelectedMenuId,
  createMenuItem,
  saveMenuItem,
  deleteMenuItem,
}) {
  const menu = data.menu || [];
  const filtered = menu.filter((item) =>
    containsQuery([item.label, item.type, item.targetValue, item.url], search),
  );
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
              className={cn(
                "rounded-lg border bg-background/40 p-3 text-left transition hover:bg-muted/50",
                selected?.id === item.id && "bg-muted",
              )}
              onClick={() => setSelectedMenuId(item.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{item.label}</p>
                <Badge variant={item.isVisible ? "default" : "outline"}>
                  {item.isVisible ? "visible" : "hidden"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.type} · {item.type === "EXTERNAL" ? item.url : item.targetValue || "built in"}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>
      <MenuEditor
        item={selected}
        pages={data.pages || []}
        menu={menu}
        onSave={saveMenuItem}
        onDelete={deleteMenuItem}
      />
    </div>
  );
}

function MenuEditor({ item, pages, menu, onSave, onDelete }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!item) {
      setDraft(null);
      return;
    }
    const editableType = menuTypes.includes(item.type) ? item.type : "PAGE";
    setDraft({
      ...item,
      type: editableType,
      targetValue:
        item.targetValue ||
        (item.type === "TERMS" ? "terms" : item.type === "CREDITS" ? "credits" : ""),
    });
  }, [item]);

  if (!item || !draft) {
    return (
      <Card className="rounded-lg">
        <CardContent className="py-10 text-sm text-muted-foreground">
          No menu item selected.
        </CardContent>
      </Card>
    );
  }

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const pageOptions = pages.map((page) => ({
    value: page.slug,
    label: `${page.title || page.slug} /${page.slug}`,
  }));
  const groupOptions = [
    { value: "none", label: "Top level" },
    ...menu
      .filter((candidate) => candidate.type === "GROUP" && candidate.id !== item.id)
      .map((candidate) => ({
        value: candidate.id,
        label: candidate.label,
      })),
  ];

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Edit Menu Item</CardTitle>
        <CardDescription>
          Page targets can point to About, Terms, Credits, or custom pages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(item.id, draft);
          }}
        >
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Label"
                value={draft.label}
                onChange={(value) => update("label", value)}
              />
              <TextField
                label="Position"
                value={String(draft.position || 0)}
                onChange={(value) => update("position", Number(value || 0))}
                type="number"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Type</FieldLabel>
                <AdminSelect
                  ariaLabel="Type"
                  value={draft.type}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      type: value,
                      targetValue:
                        value === "PAGE" && !current.targetValue
                          ? pageOptions[0]?.value || ""
                          : current.targetValue,
                    }))
                  }
                  options={menuTypes}
                />
              </Field>
              {draft.type === "PAGE" && pageOptions.length ? (
                <Field>
                  <FieldLabel>Page</FieldLabel>
                  <AdminSelect
                    ariaLabel="Page"
                    value={draft.targetValue || pageOptions[0]?.value || ""}
                    onValueChange={(value) => update("targetValue", value)}
                    options={pageOptions}
                  />
                </Field>
              ) : (
                <TextField
                  label="Target value"
                  value={draft.targetValue}
                  onChange={(value) => update("targetValue", value)}
                  placeholder="about, terms, memory id, or query"
                />
              )}
            </div>
            <TextField
              label="External URL"
              value={draft.url}
              onChange={(value) => update("url", value)}
              placeholder="https://..."
            />
            {draft.type !== "GROUP" ? (
              <Field>
                <FieldLabel>Parent group</FieldLabel>
                <AdminSelect
                  ariaLabel="Parent group"
                  value={draft.parentId || "none"}
                  onValueChange={(value) => update("parentId", value === "none" ? "" : value)}
                  options={groupOptions}
                />
                <FieldDescription>
                  One submenu level only. Groups cannot be nested.
                </FieldDescription>
              </Field>
            ) : null}
            <ToggleField
              label="Visible"
              description="Show in the public lower-right footer."
              checked={Boolean(draft.isVisible)}
              onCheckedChange={(value) => update("isVisible", value)}
            />
            <ToggleField
              label="Open in new tab"
              description="Applies to external links."
              checked={Boolean(draft.opensNewTab)}
              onCheckedChange={(value) => update("opensNewTab", value)}
            />
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

function AttachmentsView({ data, search, selectedMemoryId, uploadAttachment, deleteAttachment }) {
  const [memoryId, setMemoryId] = useState(
    String(selectedMemoryId || data.memories?.[0]?.id || ""),
  );
  const attachments = (data.attachments || []).filter((attachment) =>
    containsQuery([attachment.imageKey, attachment.storageType, attachment.mimeType], search),
  );
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
            <AdminSelect
              ariaLabel="Memory"
              value={memoryId}
              onValueChange={setMemoryId}
              options={memoryOptions}
            />
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
          <div
            className="aspect-[4/3] bg-cover bg-center"
            style={{ backgroundImage: `url("${attachment.thumbUrl}")` }}
          />
          <CardHeader>
            <CardTitle className="truncate text-sm">{attachment.imageKey}</CardTitle>
            <CardDescription>
              {attachment.storageType} · {attachment.mimeType || "image"}
            </CardDescription>
            {attachment.storageType === "v1" ? (
              <CardAction>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteAttachment(attachment)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function SettingsView({
  data,
  saveSettings,
  saveAccount,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  settingsTab,
  setSettingsTab,
}) {
  const settings = data.settings || {};
  const account = settings.account || {};
  const [siteDraft, setSiteDraft] = useState(() => ({
    siteTitle: settings.siteTitle || "Songqi",
    canonicalUrl: settings.canonicalUrl || "https://songqi.org",
    timezone: settings.timezone || "Asia/Shanghai",
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
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [securityPassword, setSecurityPassword] = useState("");

  useEffect(() => {
    setSiteDraft({
      siteTitle: settings.siteTitle || "Songqi",
      canonicalUrl: settings.canonicalUrl || "https://songqi.org",
      timezone: settings.timezone || "Asia/Shanghai",
      defaultLanguage: settings.defaultLanguage || "en",
      anonymousSubmissions: Boolean(settings.anonymousSubmissions),
      tracking: {
        enabled: Boolean(settings.tracking?.enabled),
        umamiSrc: settings.tracking?.umamiSrc || "",
        umamiWebsiteId: settings.tracking?.umamiWebsiteId || "",
      },
    });
    setAccountDraft((current) => ({ ...current, email: account.email || "" }));
  }, [
    settings.siteTitle,
    settings.canonicalUrl,
    settings.timezone,
    settings.defaultLanguage,
    settings.anonymousSubmissions,
    settings.tracking,
    account.email,
  ]);

  const updateSite = (key, value) => setSiteDraft((current) => ({ ...current, [key]: value }));
  const updateTracking = (key, value) =>
    setSiteDraft((current) => ({
      ...current,
      tracking: { ...current.tracking, [key]: value },
    }));
  const updateAccount = (key, value) =>
    setAccountDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="admin-settings">
      <Tabs value={settingsTab} onValueChange={setSettingsTab} className="admin-settings-tabs">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>
      </Tabs>
      {settingsTab === "site" ? (
        <Card className="admin-settings-card admin-site-settings-card">
          <CardHeader>
            <CardTitle>Site</CardTitle>
            <CardDescription>The defaults used by songqi.org and every new entry.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              id="settings-site-form"
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                saveSettings(siteDraft);
              }}
            >
              <FieldGroup>
                <TextField
                  label="Site title"
                  description="Used in browser titles and the public introduction."
                  value={siteDraft.siteTitle}
                  onChange={(value) => updateSite("siteTitle", value)}
                />
                <TextField
                  label="Canonical URL"
                  description="The public origin used for canonical links and sharing."
                  value={siteDraft.canonicalUrl}
                  onChange={(value) => updateSite("canonicalUrl", value)}
                  type="url"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Default language</FieldLabel>
                    <AdminSelect
                      ariaLabel="Default language"
                      value={siteDraft.defaultLanguage}
                      onValueChange={(value) => updateSite("defaultLanguage", value)}
                      options={[
                        { value: "en", label: "English" },
                        { value: "fr", label: "French" },
                        { value: "zh", label: "中文" },
                      ]}
                    />
                    <FieldDescription>Used for / and newly created content.</FieldDescription>
                  </Field>
                  <TextField
                    label="Timezone"
                    description="Used for schedules and backup timestamps."
                    value={siteDraft.timezone}
                    onChange={(value) => updateSite("timezone", value)}
                  />
                </div>
                <p className="admin-settings-section-label">Public submissions</p>
                <ToggleField
                  className="admin-settings-toggle"
                  label="Allow visitors to publish memories"
                  description="No sign-in required. New submissions publish immediately."
                  checked={siteDraft.anonymousSubmissions}
                  onCheckedChange={(value) => updateSite("anonymousSubmissions", value)}
                />
                <p className="admin-settings-section-label">Umami analytics</p>
                <div className="admin-umami-settings">
                  <ToggleField
                    className="admin-umami-toggle"
                    label="Use self-hosted Umami"
                    description="Turn this on to reveal the host URL and Website ID fields."
                    checked={siteDraft.tracking.enabled}
                    onCheckedChange={(value) => updateTracking("enabled", value)}
                  />
                  <div className="admin-umami-fields">
                    <Input
                      aria-label="Umami host URL"
                      disabled={!siteDraft.tracking.enabled}
                      value={siteDraft.tracking.umamiSrc}
                      onChange={(event) => updateTracking("umamiSrc", event.target.value)}
                      placeholder="Host URL"
                    />
                    <Input
                      aria-label="Umami Website ID"
                      disabled={!siteDraft.tracking.enabled}
                      value={siteDraft.tracking.umamiWebsiteId}
                      onChange={(event) => updateTracking("umamiWebsiteId", event.target.value)}
                      placeholder="Website ID"
                    />
                  </div>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {settingsTab === "account" ? (
        <Card className="admin-settings-card admin-account-settings-card">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              The email and password used by the single owner account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              id="settings-account-form"
              className="grid gap-5"
              onSubmit={async (event) => {
                event.preventDefault();
                const result = await saveAccount(accountDraft);
                if (result) {
                  setAccountDraft((current) => ({
                    ...current,
                    currentPassword: "",
                    newPassword: "",
                  }));
                }
              }}
            >
              <FieldGroup>
                <TextField
                  label="Admin email"
                  value={accountDraft.email}
                  onChange={(value) => updateAccount("email", value)}
                  type="email"
                  autoComplete="username"
                />
                <TextField
                  label="Current password"
                  description="Required before changing the email or password."
                  value={accountDraft.currentPassword}
                  onChange={(value) => updateAccount("currentPassword", value)}
                  type="password"
                  autoComplete="current-password"
                />
                <TextField
                  label="New password"
                  description="Use at least 12 characters and a password manager."
                  value={accountDraft.newPassword}
                  onChange={(value) => updateAccount("newPassword", value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Leave blank to keep the current password"
                />
              </FieldGroup>
              <div className="admin-session-note">
                <strong>Your current session stays active</strong>
                <p>
                  A password change signs out other sessions. Recovery codes are managed in
                  Security.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {settingsTab === "security" ? (
        <div className="admin-security-settings">
          <Card className="admin-settings-card admin-security-settings-card">
            <CardHeader>
              <CardTitle>Two-factor authentication</CardTitle>
              <CardDescription>
                {account.twoFactorEnabled
                  ? "A TOTP authenticator is required after password login."
                  : "Add a TOTP authenticator after password login."}
              </CardDescription>
              <CardAction>
                <Badge variant="outline" className="admin-security-status">
                  {account.twoFactorEnabled ? "On" : "Off"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-5">
              {account.twoFactorEnabled ? (
                <form
                  className="grid max-w-md gap-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const result = await disableTwoFactor({ totp: disableCode });
                    if (result) {
                      setDisableCode("");
                      setRecoveryCodes([]);
                    }
                  }}
                >
                  <TextField
                    label="Authenticator or recovery code"
                    value={disableCode}
                    onChange={setDisableCode}
                    inputMode="text"
                    autoComplete="one-time-code"
                  />
                  <Button variant="outline" className="w-fit" type="submit">
                    Disable 2FA
                  </Button>
                </form>
              ) : (
                <>
                  <form
                    className="grid gap-4"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const setup = await setupTwoFactor({ currentPassword: securityPassword });
                      if (setup) {
                        setTwoFactor(setup);
                        setRecoveryCodes([]);
                        setSecurityPassword("");
                      }
                    }}
                  >
                    <TextField
                      label="Current password"
                      description="This state is isolated from the Account form."
                      value={securityPassword}
                      onChange={setSecurityPassword}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Confirm your identity"
                    />
                    <Button className="w-fit" variant="outline" type="submit">
                      Start 2FA setup
                    </Button>
                  </form>
                  {!twoFactor ? (
                    <div className="admin-security-steps" aria-label="Two-factor setup steps">
                      {[
                        ["1", "Confirm", "Enter the owner password."],
                        ["2", "Pair", "Scan the QR code and enter a TOTP."],
                        ["3", "Recover", "Download one-time recovery codes."],
                      ].map(([number, title, copy]) => (
                        <div key={number}>
                          <span>{number}</span>
                          <strong>{title}</strong>
                          <p>{copy}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {twoFactor ? (
                    <form
                      className="grid gap-4 rounded-lg border bg-background/45 p-4"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const result = await enableTwoFactor({ totp: twoFactorCode });
                        if (result?.recoveryCodes?.length) {
                          setRecoveryCodes(result.recoveryCodes);
                          setTwoFactor(null);
                        }
                        if (result) setTwoFactorCode("");
                      }}
                    >
                      <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
                        <TotpQrCode value={twoFactor.otpauthUrl} />
                        <div className="grid min-w-0 gap-2 text-sm">
                          <span className="text-muted-foreground">
                            Scan this QR code with an authenticator app, or enter the secret
                            manually.
                          </span>
                          <code className="overflow-x-auto rounded border px-3 py-2">
                            {twoFactor.secret}
                          </code>
                        </div>
                      </div>
                      <TextField
                        label="Authenticator code"
                        value={twoFactorCode}
                        onChange={setTwoFactorCode}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                      />
                      <Button className="w-fit" type="submit">
                        Enable 2FA
                      </Button>
                    </form>
                  ) : null}
                </>
              )}
              {recoveryCodes.length ? (
                <div className="grid gap-4 rounded-lg border bg-background/45 p-4">
                  <div className="grid gap-1">
                    <strong className="text-sm">Recovery codes</strong>
                    <p className="text-sm text-muted-foreground">
                      Save these now. They are shown once and each code can be used one time.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {recoveryCodes.map((code) => (
                      <code key={code} className="rounded border px-3 py-2 text-center text-sm">
                        {code}
                      </code>
                    ))}
                  </div>
                  <Button
                    className="w-fit"
                    variant="outline"
                    type="button"
                    onClick={() =>
                      downloadText(
                        "i-remember-recovery-codes.txt",
                        `songqi.org recovery codes\nGenerated: ${new Date().toISOString()}\n\n${recoveryCodes.join("\n")}\n`,
                      )
                    }
                  >
                    <Download data-icon="inline-start" />
                    Download recovery codes
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <p className="admin-security-note">
            When 2FA is enabled, this card changes to an authenticator-or-recovery-code form with a
            deliberate Disable 2FA action.
          </p>
        </div>
      ) : null}
      {settingsTab === "backup" ? <BackupsView /> : null}
    </div>
  );
}

function BackupsView() {
  const rows = [
    ["Memories & pages", "Both"],
    ["Menu & comments", "Both"],
    ["Attachment metadata", "Both"],
    ["Uploaded files", "Server only"],
    ["Database & secrets", "Server only"],
  ];

  return (
    <div className="admin-backup-grid">
      <Card className="admin-settings-card admin-backup-export">
        <CardHeader>
          <p className="admin-settings-kicker">Content export</p>
          <CardTitle>Export your content</CardTitle>
          <CardDescription>
            Downloads memories, pages, menu items, comments, and attachment metadata as JSON.
            Uploaded files and server secrets are not included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="admin-backup-honesty">
            This is portable content — not a disaster-recovery backup.
          </p>
        </CardContent>
      </Card>
      <Card className="admin-settings-card">
        <CardHeader>
          <CardTitle>Recovery guardrail</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="admin-backup-copy">
            Restoring overwrites service state and requires downtime. The admin UI explains the
            process but does not expose a destructive button.
          </p>
          <strong className="admin-ok">No restore action in the browser</strong>
        </CardContent>
      </Card>
      <Card className="admin-settings-card admin-backup-server">
        <CardHeader>
          <p className="admin-settings-kicker">Server backup</p>
          <CardTitle>Full recovery stays server-side</CardTitle>
          <CardDescription>
            A complete backup includes PostgreSQL, uploaded files, auth secrets, a manifest, and
            checksums. It runs from the container and restores only into an empty volume.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code>docker compose exec app i-remember-backup</code>
          <a
            href="https://github.com/zerostwo/i-remember.fr/blob/main/docs/deployment.md"
            target="_blank"
            rel="noreferrer"
          >
            Open deployment guide ↗
          </a>
          <p>Restore is intentionally not a one-click admin action.</p>
        </CardContent>
      </Card>
      <Card className="admin-settings-card">
        <CardHeader>
          <CardTitle>What each option contains</CardTitle>
        </CardHeader>
        <CardContent className="admin-backup-scope">
          {rows.map(([title, copy]) => (
            <p key={title}>
              <span>{title}</span>
              <small>{copy}</small>
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
