import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createPrismaClient } from "../packages/database/dist/index.js";
import {
  PrismaMemoryRepository,
  PrismaAssetRepository,
  tagSlug,
} from "../apps/api/dist/prisma-repositories.js";
import { MemoryService } from "../apps/api/dist/services.js";
import { memoryPatchInput } from "../apps/api/dist/validation.js";
import { v1MemoryPayload } from "../apps/admin/src/v1-memory.js";
// Explicit opt-in: this suite writes disposable records and must use a test database.
const databaseUrl = process.env.I_REMEMBER_TEST_DATABASE_URL;
if (!databaseUrl || !/(?:test|review)/i.test(new URL(databaseUrl).pathname))
  throw new Error("Set I_REMEMBER_TEST_DATABASE_URL to a migrated disposable test database");
process.env.DATABASE_URL = databaseUrl;
const db = createPrismaClient(),
  repository = new PrismaMemoryRepository(db),
  assets = new PrismaAssetRepository(db);
const prefix = `regression-${randomBytes(6).toString("hex")}`;
const admin = { role: "ADMIN" },
  anonymous = { role: "ANONYMOUS" };
const service = new MemoryService(repository, {
  current: async () => ({ anonymousSubmissions: true }),
});
const attachments = [
  { url: `/${prefix}/photo.png`, type: "image/png", metadata: { caption: "Original" } },
  { url: `/${prefix}/note.pdf`, type: "application/pdf" },
];
try {
  const legacyId = `m${randomBytes(10).toString("hex")}`;
  const linkMemory = await repository.create({ publicId: legacyId, title: prefix, content: "Link identity", attachments });
  const firstSlug = `s${randomBytes(6).toString("hex")}`;
  const secondSlug = `s${randomBytes(6).toString("hex")}`;
  await repository.incrementView(legacyId);
  const renamed = await repository.update(legacyId, { publicId: firstSlug });
  assert.equal(renamed.mapId, linkMemory.mapId);
  assert.equal(renamed.viewCount, 1);
  assert.deepEqual(renamed.attachments, linkMemory.attachments);
  assert.equal((await repository.get(legacyId)).publicId, firstSlug);
  await repository.update(firstSlug, { publicId: secondSlug });
  assert.equal((await repository.get(legacyId)).publicId, secondSlug);
  assert.equal((await repository.get(firstSlug)).id, linkMemory.id);
  const collision = await repository.create({ title: prefix, content: "Collision check" });
  assert.match(collision.publicId, /^[A-Za-z][A-Za-z0-9]{7}$/);
  for (const reservedId of [legacyId, firstSlug, secondSlug]) {
    await assert.rejects(repository.create({ publicId: reservedId, title: prefix, content: "Do not steal" }), error => error.code === "public_id_taken");
    await assert.rejects(repository.update(collision.publicId, { publicId: reservedId }), error => error.code === "public_id_taken");
  }
  const rolledBackId = `r${randomBytes(6).toString("hex")}`;
  await assert.rejects(repository.update(secondSlug, { publicId: rolledBackId, attachments: [{ id: "not-owned", url: "/bad.jpg" }] }), error => error.code === "invalid_attachment_id");
  assert.equal(await db.memoryLink.findUnique({ where: { publicId: rolledBackId } }), null, "A failed edit must not reserve an unused link");
  const racedId = `r${randomBytes(6).toString("hex")}`;
  const raced = await Promise.allSettled([
    repository.update(secondSlug, { publicId: racedId }),
    repository.update(collision.publicId, { publicId: racedId }),
  ]);
  assert.equal(raced.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(raced.find(r => r.status === "rejected").reason.code, "public_id_taken");
  await repository.update(legacyId, { publicId: legacyId });
  for (const visibility of ["PRIVATE", "UNLISTED"]) {
    await repository.update(legacyId, { visibility });
    assert.equal(await service.get(anonymous, firstSlug), null);
  }
  await repository.update(legacyId, { visibility: "PUBLIC", status: "ARCHIVED" });
  assert.equal(await service.get(anonymous, firstSlug), null);
  await repository.update(legacyId, { status: "NORMAL", publicId: firstSlug });
  if (process.env.I_REMEMBER_TEST_PUBLIC_URL) {
    const base = new URL(process.env.I_REMEMBER_TEST_PUBLIC_URL);
    assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
    const redirect = await fetch(new URL(`/memory/${legacyId}?ln=fr`, base), { redirect: "manual" });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), `/memory/${firstSlug}?ln=fr`);
    const canonical = await fetch(new URL(`/memory/${firstSlug}`, base));
    assert.equal(canonical.status, 200);
    assert.ok((await canonical.text()).includes(`https://songqi.org/memory/${firstSlug}`));
    assert.equal((await fetch(new URL("/memory/12345", base))).status, 404);
    await repository.update(firstSlug, { visibility: "PRIVATE" });
    assert.equal((await fetch(new URL(`/memory/${legacyId}`, base), { redirect: "manual" })).status, 404);
  }
  await db.memory.deleteMany({ where: { id: { in: [linkMemory.id, collision.id] } } });
  const memory = await repository.create({
    title: prefix,
    content: "Original body",
    visibility: "PRIVATE",
    status: "NORMAL",
    attachments,
    tags: [`${prefix}旅行`, `${prefix}家人`],
  });
  const originalIds = memory.attachments.map((a) => a.id);
  const payload = v1MemoryPayload({
    publicId: memory.publicId,
    title: prefix,
    bodyMarkdown: "Edited body",
    visibility: memory.visibility,
    attachments: memory.attachments,
  });
  delete payload.publicId;
  const edited = await repository.update(memory.publicId, payload);
  assert.equal(edited.visibility, "PRIVATE");
  assert.deepEqual(
    edited.attachments.map((a) => a.id),
    originalIds,
  );
  assert.deepEqual(
    edited.attachments.map((a) => a.type),
    ["image/png", "application/pdf"],
  );
  assert.deepEqual(edited.attachments[0].metadata, { caption: "Original" });
  assert.equal(await service.get(anonymous, memory.publicId), null);
  for (const visibility of ["PRIVATE", "UNLISTED"]) {
    await repository.update(memory.publicId, { visibility, status: "PENDING" });
    const pendingPayload = v1MemoryPayload({
      publicId: memory.publicId,
      title: prefix,
      bodyMarkdown: "Edited without publishing",
      visibility,
      dbStatus: "PENDING",
    });
    delete pendingPayload.publicId;
    const saved = await service.update(admin, memory.publicId, memoryPatchInput(pendingPayload));
    assert.equal(saved.visibility, visibility);
    assert.equal(saved.status, "PENDING");
    assert.equal(await service.get(anonymous, memory.publicId), null);
  }
  await repository.archive(memory.publicId);
  assert.equal((await service.get(admin, memory.publicId)).status, "ARCHIVED");
  assert.equal(await service.get(anonymous, memory.publicId), null);
  await service.update(admin, memory.publicId, { status: "NORMAL" });
  assert.equal((await service.get(admin, memory.publicId)).visibility, "UNLISTED");
  assert.equal(await service.get(anonymous, memory.publicId), null);
  await service.update(admin, memory.publicId, { status: "NORMAL", visibility: "PUBLIC" });
  assert.equal((await service.get(anonymous, memory.publicId)).status, "NORMAL");
  const attachmentPayload = v1MemoryPayload({
    publicId: memory.publicId,
    title: prefix,
    bodyMarkdown: "Edited attachments",
    visibility: "PUBLIC",
    attachmentsDirty: true,
    attachments: [
      { ...edited.attachments[0], metadata: { caption: "Updated" } },
      edited.attachments[1],
      { url: `/${prefix}/extra.txt`, type: "text/plain" },
    ],
  });
  delete attachmentPayload.publicId;
  const withExtra = await service.update(
    admin,
    memory.publicId,
    memoryPatchInput(attachmentPayload),
  );
  assert.equal(withExtra.attachments.length, 3);
  for (const original of edited.attachments) {
    const retained = withExtra.attachments.find((attachment) => attachment.id === original.id);
    assert.ok(retained, "Adding an attachment must retain the existing attachment identities");
    assert.equal(retained.createdAt.toISOString(), original.createdAt.toISOString());
    assert.equal(retained.type, original.type);
  }
  assert.deepEqual(withExtra.attachments.find((a) => a.id === originalIds[0]).metadata, {
    caption: "Updated",
  });
  const afterRemove = await service.update(
    admin,
    memory.publicId,
    memoryPatchInput({
      attachments: withExtra.attachments.filter((a) => originalIds.includes(a.id)),
    }),
  );
  assert.deepEqual(
    afterRemove.attachments.map((a) => a.id),
    originalIds,
  );
  assert.equal(await db.attachment.count({ where: { url: `/${prefix}/extra.txt` } }), 0);
  const beforeInvalid = await repository.get(memory.publicId);
  await assert.rejects(
    service.update(
      admin,
      memory.publicId,
      memoryPatchInput({
        content: "Must not be persisted",
        attachments: [{ ...afterRemove.attachments[0], id: "missing-attachment" }],
      }),
    ),
    (error) => error.code === "invalid_attachment_id",
  );
  assert.deepEqual(await repository.get(memory.publicId), beforeInvalid);
  await assert.rejects(
    service.update(
      admin,
      memory.publicId,
      memoryPatchInput({
        attachments: [afterRemove.attachments[0], afterRemove.attachments[0]],
      }),
    ),
    (error) => error.code === "invalid_attachment_id",
  );
  assert.throws(
    () => memoryPatchInput({ attachments: Array.from({ length: 25 }, () => attachments[0]) }),
    (error) => error.code === "too_many_attachments",
    "Oversized attachment arrays must fail instead of silently dropping the tail",
  );
  const tags = await repository.create({
    title: prefix,
    content: "Different Chinese tags",
    tags: [`${prefix}朋友`, `${prefix}旅行`],
  });
  assert.equal(tags.tags.length, 2);
  assert.equal(memory.tags.length, 2);
  assert.equal(new Set([...tags.tags, ...memory.tags].map((t) => t.id)).size, 3);
  await assert.rejects(
    service.update(
      admin,
      tags.publicId,
      memoryPatchInput({
        attachments: [afterRemove.attachments[0]],
      }),
    ),
    (error) => error.code === "invalid_attachment_id",
    "An attachment cannot be moved between memories by submitting another memory's ID",
  );
  assert.notEqual(tagSlug("旅行"), tagSlug("家人"));
  assert.notEqual(tagSlug("a+b"), tagSlug("a-b"));
  assert.equal(tagSlug("é"), tagSlug("e\u0301"));
  await db.tag.create({ data: { name: `${prefix}旧标签`, slug: `${prefix}-old-slug` } });
  await repository.update(memory.publicId, { tags: [`${prefix}旧标签`] });
  assert.equal(
    (await repository.get(memory.publicId)).tags[0].slug,
    `${prefix}-old-slug`,
    "Existing unique tag names must not fail after the slug fix",
  );
  const createdAt = new Date("2026-01-01T00:00:00Z");
  await db.memory.createMany({
    data: Array.from({ length: 405 }, (_, i) => ({
      publicId: `m${randomBytes(10).toString("hex")}`,
      mapKey: `test-map-${prefix}-${i}`,
      title: `${prefix}-${i}`,
      content: `${prefix} cursor page ${i}`,
      status: "NORMAL",
      visibility: "PUBLIC",
      createdAt,
    })),
  });
  let cursor,
    ids = [];
  do {
    const page = await service.page(anonymous, { q: `${prefix} cursor page`, limit: 200, cursor });
    assert.equal(page.pagination.total, 405);
    ids.push(...page.data.map((m) => m.publicId));
    cursor = page.pagination.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 405);
  assert.equal(new Set(ids).size, 405, "Equal timestamps must neither skip nor duplicate records");
  if (process.env.I_REMEMBER_TEST_PUBLIC_URL) {
    const base = new URL(process.env.I_REMEMBER_TEST_PUBLIC_URL);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(base.hostname),
      "Public regression endpoint must be local",
    );
    const path = `/api/search-posts/${prefix}`;
    let lastId = "",
      publicIds = [];
    do {
      const response = await fetch(new URL(`${path}${lastId ? `?lastId=${lastId}` : ""}`, base));
      assert.equal(response.status, 200);
      const posts = (await response.json()).data.posts;
      publicIds.push(...posts.map((p) => p.public_id));
      lastId = posts.length === 200 ? posts.at(-1).id : "";
    } while (lastId);
    assert.equal(publicIds.length, 407);
    assert.equal(new Set(publicIds).size, 407);
  }
  const search = await service.page(anonymous, { q: `${prefix} cursor page 0`, limit: 10 });
  assert.equal(search.data.length, 1);
  await db.attachment.createMany({
    data: Array.from({ length: 205 }, (_, i) => ({
      memoryId: memory.id,
      url: `/${prefix}/${i}.png`,
      type: "image/png",
      createdAt,
    })),
  });
  let assetCursor,
    assetIds = [];
  do {
    const page = await assets.list(200, assetCursor);
    assetIds.push(...page);
    assetCursor = page.length === 200 ? page.at(-1).id : undefined;
  } while (assetCursor);
  const owned = assetIds.filter((a) => a.url.includes(prefix));
  assert.equal(owned.length, 207);
  assert.equal(new Set(owned.map((a) => a.id)).size, 207);
  assert.ok(owned.every((a) => a.memoryId === memory.publicId));
  console.log(
    "PostgreSQL regressions passed: short/custom IDs, alias redirects, concurrent conflicts, stable map/views/attachments, private alias protection, private/unlisted draft preservation, unchanged and edited attachment IDs/types/timestamps, attachment ownership and count validation, archive restore, Unicode/existing tags, 405 records and 207 attachment pagination",
  );
} finally {
  await db.memory.deleteMany({ where: { title: { startsWith: prefix } } });
  await db.tag.deleteMany({ where: { name: { startsWith: prefix } } });
  await db.$disconnect();
}
