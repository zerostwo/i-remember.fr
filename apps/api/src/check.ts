import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import type {
  AssetCreateInput,
  AssetRecord,
  MemoryInput,
  MemoryRecord,
  MemoryUpdateInput,
  UserRecord,
} from "./domain.js";
import { createApiV1Middleware } from "./index.js";
import type {
  AssetRepository,
  MemoryListQuery,
  MemoryRepository,
  UserRepository,
} from "./repositories.js";
import { ApiError } from "./errors.js";
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
  async list(): Promise<UserRecord[]> {
    return [{ id: "u1", email: "admin@example.com", role: "ADMIN", createdAt: new Date() }];
  }

  async count() {
    return (await this.list()).length;
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

assert.equal((await json("/api/v1/memories")).body.data[0].id, "pub_1");
assert.equal((await json("/api/v1/search?q=first")).body.data.length, 1);
assert.equal((await json("/api/v1/memories/pub_1")).body.data.title, "First memory");

const agent = await json("/api/v1/agent", {
  method: "POST",
  body: JSON.stringify({ query: "first", limit: 3 }),
});
assert.equal(agent.response.status, 200);
assert.equal(agent.body.data.citations[0].id, "pub_1");
assert.equal(agent.body.data.citations[0].url, "/memory/pub_1");

const emptyAgent = await json("/api/v1/agent", {
  method: "POST",
  body: JSON.stringify({ query: "" }),
});
assert.equal(emptyAgent.response.status, 400);

const created = await json("/api/v1/memories", {
  method: "POST",
  body: JSON.stringify({
    title: "New",
    content: "Created through v1 API",
    legacyId: 9001,
    tags: ["Paris", "Archive"],
    attachments: [{ url: "/uploads/new.jpg", type: "image/jpeg" }],
  }),
});
assert.equal(created.response.status, 201);
assert.equal(created.body.data.status, "PENDING");
assert.equal(created.body.data.legacyId, 9001);
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

const unauthorizedDashboard = await json("/api/v1/dashboard");
assert.equal(unauthorizedDashboard.response.status, 401);

const dashboard = await json("/api/v1/dashboard", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(dashboard.response.status, 200);
assert.equal(dashboard.body.data.totalUsers, 1);
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

const assetUrl = await json("/api/v1/assets/asset-test.txt", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(assetUrl.body.data.url, "/uploads/asset-test.txt");

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
