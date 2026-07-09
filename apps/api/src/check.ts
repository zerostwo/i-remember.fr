import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AssetCreateInput,
  AssetRecord,
  CommentInput,
  CommentRecord,
  CommentUpdateInput,
  MenuItemInput,
  MenuItemRecord,
  MenuItemUpdateInput,
  MemoryInput,
  MemoryRecord,
  MemoryUpdateInput,
  PageInput,
  PageRecord,
  PageUpdateInput,
  SettingRecord,
  UserRecord,
} from "./domain.js";
import { createApiV1Middleware } from "./index.js";
import { serveLocalAsset } from "./static-assets.js";
import type {
  AssetRepository,
  CommentListQuery,
  CommentRepository,
  MenuItemRepository,
  MemoryListQuery,
  MemoryRepository,
  PageRepository,
  SettingRepository,
  UserRepository,
} from "./repositories.js";
import { ApiError } from "./errors.js";
import { createPublicMemoryId } from "./prisma-repositories.js";
import type { StorageAdapter } from "@i-remember/storage";

function tag(name: string) {
  return {
    id: `tag-${name.toLowerCase()}`,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  };
}

function attachments(input: MemoryInput["attachments"] = [], memoryId = "internal-1") {
  return input.map((attachment, index) => ({
    id: `attachment-${index + 1}`,
    memoryId,
    url: attachment.url,
    type: attachment.type || "application/octet-stream",
    metadata: attachment.metadata || {},
    createdAt: new Date("2026-01-02T00:00:00Z"),
  }));
}

class MemoryRepo implements MemoryRepository {
  memories: MemoryRecord[] = [
    {
      id: "internal-1",
      publicId: "pub_1",
      title: "First memory",
      content: "I remember the first test memory.",
      excerpt: "I remember the first test memory.",
      authorName: "Tester",
      visibility: "PUBLIC",
      status: "NORMAL",
      metadata: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ];

  async list(query: MemoryListQuery) {
    return this.memories.filter((memory) => {
      if (query.status !== "all" && memory.status !== (query.status || "NORMAL")) return false;
      if (query.visibility !== "all" && memory.visibility !== (query.visibility || "PUBLIC"))
        return false;
      const q = query.q?.toLowerCase();
      const haystack = [
        memory.title,
        memory.content,
        memory.excerpt,
        ...(memory.tags || []).flatMap((item) => [item.name, item.slug]),
      ]
        .join(" ")
        .toLowerCase();
      return !q || haystack.includes(q);
    });
  }

  async count(query: MemoryListQuery) {
    return (await this.list(query)).length;
  }

  async get(id: string) {
    return this.memories.find((memory) => memory.publicId === id || memory.id === id) || null;
  }

  async create(input: MemoryInput) {
    const memory = {
      id: `internal-${this.memories.length + 1}`,
      publicId: `pub_${this.memories.length + 1}`,
      legacyId: input.legacyId,
      title: input.title,
      content: input.content,
      excerpt: input.content.slice(0, 220),
      authorName: input.authorName,
      visibility: input.visibility || "PUBLIC",
      status: "PENDING",
      metadata: input.metadata || {},
      attachments: attachments(input.attachments, `internal-${this.memories.length + 1}`),
      tags: (input.tags || []).map(tag),
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    } satisfies MemoryRecord;
    this.memories.unshift(memory);
    return memory;
  }

  async update(id: string, input: MemoryUpdateInput) {
    const memory = await this.get(id);
    assert.ok(memory);
    Object.assign(memory, input, { updatedAt: new Date("2026-01-03T00:00:00Z") });
    return memory;
  }

  async archive(id: string) {
    const memory = await this.get(id);
    assert.ok(memory);
    memory.status = "ARCHIVED";
    return memory;
  }
}

class UserRepo implements UserRepository {
  users: UserRecord[] = [
    {
      id: "u1",
      email: "admin@example.com",
      passwordHash: "pbkdf2$210000$api-check-salt$v8lW0mYRgw8AS0iO9ri4qjK-jhb-r-iI6wk5xx3olII",
      role: "ADMIN",
      createdAt: new Date(),
    },
    {
      id: "u2",
      email: "reader@example.com",
      passwordHash: "pbkdf2$210000$api-check-salt$v8lW0mYRgw8AS0iO9ri4qjK-jhb-r-iI6wk5xx3olII",
      role: "USER",
      createdAt: new Date(),
    },
  ];

  async list(): Promise<UserRecord[]> {
    return this.users;
  }

  async count() {
    return (await this.list()).length;
  }

  async findByEmail(email: string) {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
  }
}

class PageRepo implements PageRepository {
  pages: PageRecord[] = [];

  async list(language = "en") {
    return this.pages.filter((page) => page.language === language);
  }

  async get(slug: string, language = "en") {
    return this.pages.find((page) => page.slug === slug && page.language === language) || null;
  }

  async create(input: PageInput) {
    const page = {
      id: `page-${this.pages.length + 1}`,
      slug: input.slug,
      language: input.language || "en",
      title: input.title,
      excerpt: input.excerpt,
      bodyMarkdown: input.bodyMarkdown || "",
      status: input.status || "DRAFT",
      linkedMemoryId: input.linkedMemoryId,
      metadata: input.metadata || {},
      createdAt: new Date("2026-01-04T00:00:00Z"),
      updatedAt: new Date("2026-01-04T00:00:00Z"),
    } satisfies PageRecord;
    this.pages.unshift(page);
    return page;
  }

  async update(slug: string, input: PageUpdateInput, language = "en") {
    const page = await this.get(slug, language);
    assert.ok(page);
    Object.assign(page, input, { updatedAt: new Date("2026-01-05T00:00:00Z") });
    return page;
  }

  async archive(slug: string, language = "en") {
    return this.update(slug, { status: "ARCHIVED" }, language);
  }
}

class MenuItemRepo implements MenuItemRepository {
  items: MenuItemRecord[] = [];

  async list(language = "en") {
    return this.items.filter((item) => item.language === language);
  }

  async create(input: MenuItemInput) {
    const item = {
      id: `menu-${this.items.length + 1}`,
      uid: input.uid || `menu-${this.items.length + 1}`,
      language: input.language || "en",
      label: input.label,
      type: input.type,
      targetValue: input.targetValue,
      url: input.url,
      position: input.position || 0,
      isVisible: input.isVisible ?? true,
      opensNewTab: input.opensNewTab ?? false,
      metadata: input.metadata || {},
      createdAt: new Date("2026-01-04T00:00:00Z"),
      updatedAt: new Date("2026-01-04T00:00:00Z"),
    } satisfies MenuItemRecord;
    this.items.push(item);
    return item;
  }

  async update(id: string, input: MenuItemUpdateInput) {
    const item = this.items.find((candidate) => candidate.id === id);
    assert.ok(item);
    Object.assign(item, input, { updatedAt: new Date("2026-01-05T00:00:00Z") });
    return item;
  }

  async delete(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
  }
}

class SettingRepo implements SettingRepository {
  settings = new Map<string, SettingRecord>();

  async list() {
    return [...this.settings.values()];
  }

  async upsertMany(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      this.settings.set(key, {
        key,
        value,
        updatedAt: new Date("2026-01-04T00:00:00Z"),
      });
    }
    return this.list();
  }
}

class CommentRepo implements CommentRepository {
  comments: CommentRecord[] = [];

  async list(query: CommentListQuery) {
    return this.comments.filter((comment) => {
      if (query.status !== "all" && comment.status !== (query.status || "PENDING")) return false;
      if (
        query.memoryId &&
        comment.memoryId !== query.memoryId &&
        comment.memoryPublicId !== query.memoryId
      ) {
        return false;
      }
      const q = query.q?.toLowerCase();
      return (
        !q ||
        [comment.authorName, comment.authorEmail, comment.content, comment.memoryTitle]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    });
  }

  async create(input: CommentInput) {
    const comment = {
      id: `comment-${this.comments.length + 1}`,
      memoryId: "internal-1",
      memoryPublicId: input.memoryId || "pub_1",
      memoryTitle: "First memory",
      authorName: input.authorName || "Anonymous",
      authorEmail: input.authorEmail,
      content: input.content,
      status: input.status || "PENDING",
      metadata: input.metadata || {},
      createdAt: new Date("2026-01-06T00:00:00Z"),
      updatedAt: new Date("2026-01-06T00:00:00Z"),
    } satisfies CommentRecord;
    this.comments.unshift(comment);
    return comment;
  }

  async update(id: string, input: CommentUpdateInput) {
    const comment = this.comments.find((candidate) => candidate.id === id);
    assert.ok(comment);
    Object.assign(comment, input, { updatedAt: new Date("2026-01-07T00:00:00Z") });
    return comment;
  }

  async archive(id: string) {
    return this.update(id, { status: "ARCHIVED" });
  }
}

class AssetRepo implements AssetRepository {
  assets: AssetRecord[] = [
    {
      id: "a1",
      memoryId: "internal-1",
      url: "/uploads/a1.jpg",
      type: "image/jpeg",
      metadata: {},
      createdAt: new Date(),
    },
  ];

  async list(): Promise<AssetRecord[]> {
    return this.assets;
  }

  async create(input: AssetCreateInput): Promise<AssetRecord> {
    if (input.memoryId === "missing") throw new ApiError(404, "Memory not found", "not_found");
    const asset = {
      id: `asset-${this.assets.length + 1}`,
      memoryId: input.memoryId,
      url: input.url,
      type: input.type,
      metadata: input.metadata || {},
      createdAt: new Date(),
    };
    this.assets.unshift(asset);
    return asset;
  }

  async deleteByUrl(url: string) {
    this.assets = this.assets.filter((asset) => asset.url !== url);
  }
}

class Storage implements StorageAdapter {
  keys = new Set<string>();

  async upload(key: string) {
    this.keys.add(key);
    return `/uploads/${key}`;
  }

  async delete(key: string) {
    this.keys.delete(key);
  }

  getUrl(key: string) {
    return `/uploads/${key}`;
  }
}

process.env.AUTH_SECRET = "test-secret";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.ADMIN_PASSWORD = "password123456";
const storage = new Storage();

const middleware = createApiV1Middleware({
  memories: new MemoryRepo(),
  users: new UserRepo(),
  assets: new AssetRepo(),
  comments: new CommentRepo(),
  pages: new PageRepo(),
  menuItems: new MenuItemRepo(),
  settings: new SettingRepo(),
  storage,
});
const server = createServer((req, res) => {
  middleware(req, res, () => {
    res.statusCode = 404;
    res.end("not found");
  });
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.notEqual(address, null);
assert.equal(typeof address, "object");
const port = (address as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}`;

async function json(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

const generatedPublicIds = new Set(Array.from({ length: 32 }, createPublicMemoryId));
assert.equal(generatedPublicIds.size, 32);
for (const publicId of generatedPublicIds) {
  assert.match(publicId, /^[a-f0-9]{20}$/);
}

assert.equal((await json("/api/v1/memories")).body.data[0].id, "pub_1");
assert.equal((await json("/api/v1/search?q=first")).body.data.length, 1);
assert.equal((await json("/api/v1/memories/pub_1")).body.data.title, "First memory");

const invalidMemoryLimit = await json("/api/v1/memories?limit=abc");
assert.equal(invalidMemoryLimit.response.status, 400);
assert.equal(invalidMemoryLimit.body.error.code, "invalid_limit");

const agent = await json("/api/v1/agent", {
  method: "POST",
  body: JSON.stringify({ query: "first", limit: 3 }),
});
assert.equal(agent.response.status, 200);
assert.equal(agent.body.data.citations[0].id, "pub_1");
assert.equal(agent.body.data.citations[0].url, "/memory/pub_1");

const invalidAgentLimit = await json("/api/v1/agent", {
  method: "POST",
  body: JSON.stringify({ query: "first", limit: "abc" }),
});
assert.equal(invalidAgentLimit.response.status, 400);
assert.equal(invalidAgentLimit.body.error.code, "invalid_limit");

const emptyAgent = await json("/api/v1/agent", {
  method: "POST",
  body: JSON.stringify({ query: "" }),
});
assert.equal(emptyAgent.response.status, 400);

const invalidLatitude = await json("/api/v1/memories", {
  method: "POST",
  body: JSON.stringify({ title: "Bad coordinate", content: "Invalid", latitude: 91 }),
});
assert.equal(invalidLatitude.response.status, 400);
assert.equal(invalidLatitude.body.error.code, "invalid_latitude");

const memoryMarkdown = "# Created\n\nThrough v1 API";
const created = await json("/api/v1/memories", {
  method: "POST",
  body: JSON.stringify({
    title: "New",
    content: memoryMarkdown,
    legacyId: 9001,
    tags: ["Paris", "Archive"],
    attachments: [{ url: "/uploads/new.jpg", type: "image/jpeg" }],
  }),
});
assert.equal(created.response.status, 201);
assert.equal(created.body.data.status, "PENDING");
assert.equal(created.body.data.legacyId, 9001);
assert.equal(created.body.data.content, memoryMarkdown);
assert.deepEqual(
  created.body.data.tags.map((item: { name: string }) => item.name),
  ["Paris", "Archive"],
);
assert.equal(created.body.data.attachments[0].url, "/uploads/new.jpg");

const publicPendingDetail = await json(`/api/v1/memories/${created.body.data.id}`);
assert.equal(publicPendingDetail.response.status, 401);

const adminPendingDetail = await json(`/api/v1/memories/${created.body.data.id}`, {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(adminPendingDetail.response.status, 200);

const invalidLongitude = await json(`/api/v1/memories/${created.body.data.id}`, {
  method: "PATCH",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({ longitude: -181 }),
});
assert.equal(invalidLongitude.response.status, 400);
assert.equal(invalidLongitude.body.error.code, "invalid_longitude");

const publicAfterCreate = await json("/api/v1/memories");
assert.equal(
  publicAfterCreate.body.data.some((memory: { id: string }) => memory.id === created.body.data.id),
  false,
);

const anonymousPending = await json("/api/v1/memories?status=PENDING");
assert.equal(anonymousPending.response.status, 401);

const adminPending = await json("/api/v1/memories?status=PENDING", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(adminPending.response.status, 200);
assert.equal(adminPending.body.data[0].id, created.body.data.id);

const moderated = await json(`/api/v1/memories/${created.body.data.id}`, {
  method: "PATCH",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({ status: "NORMAL" }),
});
assert.equal(moderated.response.status, 200);
assert.equal(moderated.body.data.status, "NORMAL");
assert.equal((await json("/api/v1/search?q=Archive")).body.data[0].id, created.body.data.id);
assert.equal((await json("/api/v1/memories?legacyId=9001")).body.data[0].id, created.body.data.id);

const unauthorized = await json("/api/v1/users");
assert.equal(unauthorized.response.status, 401);

const authorized = await json("/api/v1/users", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(authorized.response.status, 200);
assert.equal(authorized.body.data[0].role, "ADMIN");
assert.equal(authorized.body.data[0].passwordHash, undefined);

const loggedIn = await json("/api/v1/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "admin@example.com", password: "password123456" }),
});
assert.equal(loggedIn.response.status, 200);
assert.equal(loggedIn.body.data.user.role, "ADMIN");
assert.notEqual(loggedIn.body.data.token, "test-secret");

const tokenAuthorized = await json("/api/v1/users", {
  headers: { Authorization: `Bearer ${loggedIn.body.data.token}` },
});
assert.equal(tokenAuthorized.response.status, 200);
assert.equal(tokenAuthorized.body.data[0].email, "admin@example.com");

const failedLogin = await json("/api/v1/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "admin@example.com", password: "wrong-password" }),
});
assert.equal(failedLogin.response.status, 401);

const userLogin = await json("/api/v1/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "reader@example.com", password: "password123456" }),
});
assert.equal(userLogin.response.status, 200);
assert.equal(userLogin.body.data.user.role, "USER");

const userBlockedFromAdmin = await json("/api/v1/users", {
  headers: { Authorization: `Bearer ${userLogin.body.data.token}` },
});
assert.equal(userBlockedFromAdmin.response.status, 403);

const unauthorizedPages = await json("/api/v1/pages");
assert.equal(unauthorizedPages.response.status, 401);

const unauthorizedComments = await json("/api/v1/comments");
assert.equal(unauthorizedComments.response.status, 401);

const createdComment = await json("/api/v1/comments", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    memoryId: "pub_1",
    authorName: "Reader",
    content: "A pending comment\n\nSecond line",
  }),
});
assert.equal(createdComment.response.status, 201);
assert.equal(createdComment.body.data.status, "PENDING");
assert.equal(createdComment.body.data.memoryId, "pub_1");
assert.equal(createdComment.body.data.content, "A pending comment\n\nSecond line");

const listedComments = await json("/api/v1/comments?status=all&q=reader", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(listedComments.body.data[0].id, createdComment.body.data.id);

const invalidCommentLimit = await json("/api/v1/comments?limit=abc", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(invalidCommentLimit.response.status, 400);
assert.equal(invalidCommentLimit.body.error.code, "invalid_limit");

const approvedComment = await json(`/api/v1/comments/${createdComment.body.data.id}`, {
  method: "PATCH",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({ status: "NORMAL" }),
});
assert.equal(approvedComment.body.data.status, "NORMAL");

const archivedComment = await json(`/api/v1/comments/${createdComment.body.data.id}`, {
  method: "DELETE",
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(archivedComment.body.data.status, "ARCHIVED");

const invalidPageSlug = await json("/api/v1/pages", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    slug: "../bad",
    title: "Bad",
  }),
});
assert.equal(invalidPageSlug.response.status, 400);
assert.equal(invalidPageSlug.body.error.code, "invalid_page_slug");

const invalidPagePath = await json("/api/v1/pages/..%2Fbad", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(invalidPagePath.response.status, 400);
assert.equal(invalidPagePath.body.error.code, "invalid_page_slug");

const createdPage = await json("/api/v1/pages", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    slug: "about",
    title: "About",
    bodyMarkdown: "# About\n\nManaged in v1.",
    status: "DRAFT",
  }),
});
assert.equal(createdPage.response.status, 201);
assert.equal(createdPage.body.data.slug, "about");
assert.equal(createdPage.body.data.bodyMarkdown, "# About\n\nManaged in v1.");

const invalidPageRename = await json("/api/v1/pages/about", {
  method: "PATCH",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({ slug: "Bad Slug" }),
});
assert.equal(invalidPageRename.response.status, 400);
assert.equal(invalidPageRename.body.error.code, "invalid_page_slug");

const updatedPage = await json("/api/v1/pages/about", {
  method: "PATCH",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({ status: "PUBLISHED", metadata: { footer: true } }),
});
assert.equal(updatedPage.body.data.status, "PUBLISHED");
assert.equal(updatedPage.body.data.metadata.footer, true);

const listedPages = await json("/api/v1/pages", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(listedPages.body.data[0].slug, "about");

const createdMenuItem = await json("/api/v1/menu-items", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    label: "About",
    type: "PAGE",
    targetValue: "about",
    position: 10,
  }),
});
assert.equal(createdMenuItem.response.status, 201);
assert.equal(createdMenuItem.body.data.type, "PAGE");

const updatedMenuItem = await json(`/api/v1/menu-items/${createdMenuItem.body.data.id}`, {
  method: "PATCH",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({ label: "About us", opensNewTab: true }),
});
assert.equal(updatedMenuItem.body.data.label, "About us");
assert.equal(updatedMenuItem.body.data.opensNewTab, true);

const savedSettings = await json("/api/v1/settings", {
  method: "PUT",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    defaultLanguage: "en",
    tracking: { enabled: true, provider: "umami" },
  }),
});
assert.equal(savedSettings.body.data.defaultLanguage, "en");
assert.equal(savedSettings.body.data.tracking.provider, "umami");

const listedSettings = await json("/api/v1/settings", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(listedSettings.body.data.tracking.enabled, true);

const deletedMenuItem = await json(`/api/v1/menu-items/${createdMenuItem.body.data.id}`, {
  method: "DELETE",
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(deletedMenuItem.body.data.deleted, true);

const unauthorizedDashboard = await json("/api/v1/dashboard");
assert.equal(unauthorizedDashboard.response.status, 401);

const dashboard = await json("/api/v1/dashboard", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(dashboard.response.status, 200);
assert.equal(dashboard.body.data.totalUsers, 2);
assert.equal(dashboard.body.data.totalMemories, 2);
assert.equal(dashboard.body.data.pendingMemories, 0);
assert.equal(dashboard.body.data.publishedMemories, 2);

const uploaded = await json("/api/v1/assets", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    key: "asset-test.txt",
    memoryId: created.body.data.id,
    contentBase64: Buffer.from("asset smoke").toString("base64"),
    contentType: "text/plain",
  }),
});
assert.equal(uploaded.response.status, 201);
assert.equal(uploaded.body.data.url, "/uploads/asset-test.txt");
assert.equal(uploaded.body.data.memoryId, created.body.data.id);

const invalidAssetContent = await json("/api/v1/assets", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    key: "invalid.txt",
    contentBase64: "%%%not-base64%%%",
    contentType: "text/plain",
  }),
});
assert.equal(invalidAssetContent.response.status, 400);
assert.equal(invalidAssetContent.body.error.code, "invalid_asset_content");

const emptyDecodedAssetContent = await json("/api/v1/assets", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    key: "empty-decoded.txt",
    contentBase64: "A==",
    contentType: "text/plain",
  }),
});
assert.equal(emptyDecodedAssetContent.response.status, 400);
assert.equal(emptyDecodedAssetContent.body.error.code, "invalid_asset_content");

const invalidAssetKey = await json("/api/v1/assets", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    key: "../invalid.txt",
    contentBase64: Buffer.from("invalid key").toString("base64"),
    contentType: "text/plain",
  }),
});
assert.equal(invalidAssetKey.response.status, 400);
assert.equal(invalidAssetKey.body.error.code, "invalid_asset_key");

const failedUpload = await json("/api/v1/assets", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    key: "orphan-test.txt",
    memoryId: "missing",
    contentBase64: Buffer.from("orphan").toString("base64"),
    contentType: "text/plain",
  }),
});
assert.equal(failedUpload.response.status, 404);
assert.equal(storage.keys.has("orphan-test.txt"), false);

const assetsAfterUpload = await json("/api/v1/assets", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(assetsAfterUpload.body.data[0].url, "/uploads/asset-test.txt");

const invalidAssetLimit = await json("/api/v1/assets?limit=abc", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(invalidAssetLimit.response.status, 400);
assert.equal(invalidAssetLimit.body.error.code, "invalid_asset_limit");

const assetUrl = await json("/api/v1/assets/asset-test.txt", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(assetUrl.body.data.url, "/uploads/asset-test.txt");

const nestedAssetUrl = await json("/api/v1/assets/memory/nested-test.txt", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(nestedAssetUrl.body.data.url, "/uploads/memory/nested-test.txt");

const invalidAssetPath = await json("/api/v1/assets/..%2Fsecret.txt", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(invalidAssetPath.response.status, 400);
assert.equal(invalidAssetPath.body.error.code, "invalid_asset_key");

const assetRoot = await mkdtemp(join(tmpdir(), "i-remember-api-assets-"));
const assetServer = createServer((req, res) => {
  if (serveLocalAsset(req, res, { rootDir: assetRoot, publicBaseUrl: "/uploads" })) return;
  res.statusCode = 404;
  res.end("not found");
});
try {
  await writeFile(join(assetRoot, "served.txt"), "served asset");
  await new Promise<void>((resolve) => assetServer.listen(0, "127.0.0.1", resolve));
  const assetAddress = assetServer.address();
  assert.notEqual(assetAddress, null);
  assert.equal(typeof assetAddress, "object");
  const assetBaseUrl = `http://127.0.0.1:${(assetAddress as AddressInfo).port}`;

  const servedAsset = await fetch(`${assetBaseUrl}/uploads/served.txt`);
  assert.equal(servedAsset.status, 200);
  assert.equal(servedAsset.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await servedAsset.text(), "served asset");

  const traversal = await fetch(`${assetBaseUrl}/uploads/..%2Fsecret.txt`);
  assert.equal(traversal.status, 403);
} finally {
  await new Promise<void>((resolve, reject) => {
    assetServer.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(assetRoot, { recursive: true, force: true });
}

const deleted = await json("/api/v1/assets/asset-test.txt", {
  method: "DELETE",
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(deleted.body.data.deleted, true);
const assetsAfterDelete = await json("/api/v1/assets", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(
  assetsAfterDelete.body.data.some(
    (asset: { url: string }) => asset.url === "/uploads/asset-test.txt",
  ),
  false,
);

await new Promise<void>((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});
console.log("api app ok");
