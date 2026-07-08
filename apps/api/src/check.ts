import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import type { AssetRecord, MemoryInput, MemoryRecord, UserRecord } from "./domain.js";
import { createApiV1Middleware } from "./index.js";
import type {
  AssetRepository,
  MemoryListQuery,
  MemoryRepository,
  UserRepository,
} from "./repositories.js";
import type { StorageAdapter } from "@i-remember/storage";

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
    if (!query.q) return this.memories;
    return this.memories.filter((memory) => memory.content.includes(query.q || ""));
  }

  async get(id: string) {
    return this.memories.find((memory) => memory.publicId === id || memory.id === id) || null;
  }

  async create(input: MemoryInput) {
    const memory = {
      id: `internal-${this.memories.length + 1}`,
      publicId: `pub_${this.memories.length + 1}`,
      title: input.title,
      content: input.content,
      excerpt: input.content.slice(0, 220),
      authorName: input.authorName,
      visibility: input.visibility || "PUBLIC",
      status: "PENDING",
      metadata: input.metadata || {},
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    } satisfies MemoryRecord;
    this.memories.unshift(memory);
    return memory;
  }

  async update(id: string, input: Partial<MemoryInput>) {
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
}

class AssetRepo implements AssetRepository {
  async list(): Promise<AssetRecord[]> {
    return [
      {
        id: "a1",
        memoryId: "internal-1",
        url: "/uploads/a1.jpg",
        type: "image/jpeg",
        metadata: {},
        createdAt: new Date(),
      },
    ];
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

const middleware = createApiV1Middleware({
  memories: new MemoryRepo(),
  users: new UserRepo(),
  assets: new AssetRepo(),
  storage: new Storage(),
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

const created = await json("/api/v1/memories", {
  method: "POST",
  body: JSON.stringify({ title: "New", content: "Created through v1 API" }),
});
assert.equal(created.response.status, 201);
assert.equal(created.body.data.status, "PENDING");

const unauthorized = await json("/api/v1/users");
assert.equal(unauthorized.response.status, 401);

const authorized = await json("/api/v1/users", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(authorized.response.status, 200);
assert.equal(authorized.body.data[0].role, "ADMIN");

const uploaded = await json("/api/v1/assets", {
  method: "POST",
  headers: { Authorization: "Bearer test-secret" },
  body: JSON.stringify({
    key: "asset-test.txt",
    contentBase64: Buffer.from("asset smoke").toString("base64"),
    contentType: "text/plain",
  }),
});
assert.equal(uploaded.response.status, 201);
assert.equal(uploaded.body.data.url, "/uploads/asset-test.txt");

const assetUrl = await json("/api/v1/assets/asset-test.txt", {
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(assetUrl.body.data.url, "/uploads/asset-test.txt");

const deleted = await json("/api/v1/assets/asset-test.txt", {
  method: "DELETE",
  headers: { Authorization: "Bearer test-secret" },
});
assert.equal(deleted.body.data.deleted, true);

await new Promise<void>((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});
console.log("api app ok");
