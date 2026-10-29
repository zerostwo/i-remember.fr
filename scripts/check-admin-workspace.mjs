import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { pagePatchInput } from "../apps/api/dist/validation.js";
import { createPrismaClient } from "../packages/database/dist/index.js";
import {
  PrismaPageRepository,
  PrismaMemoryRepository,
} from "../apps/api/dist/prisma-repositories.js";

const url = process.env.I_REMEMBER_TEST_DATABASE_URL;
if (!url || !/(?:test|review)/i.test(new URL(url).pathname))
  throw new Error("Use a disposable test/review database");
process.env.DATABASE_URL = url;
const db = createPrismaClient(),
  pages = new PrismaPageRepository(db),
  memories = new PrismaMemoryRepository(db);
const prefix = `workspace-${randomBytes(6).toString("hex")}`;
const memoryIds = [];
try {
  const draft = await pages.create({
    slug: prefix,
    title: prefix,
    bodyMarkdown: "# A complete story\n\nTwo paragraphs.",
    status: "DRAFT",
  });
  assert.equal(draft.linkedMemoryId, null, "Drafts must not create phantom memories");
  const [published, concurrent] = await Promise.all([
    pages.update(prefix, { status: "PUBLISHED" }),
    pages.update(prefix, { status: "PUBLISHED" }),
  ]);
  assert.equal(
    published.linkedMemoryId,
    concurrent.linkedMemoryId,
    "Concurrent publishing must create only one mirror",
  );
  let mirror = await memories.get(published.linkedMemoryId);
  memoryIds.push(mirror.id);
  assert.equal(mirror.content, draft.bodyMarkdown);
  assert.equal(mirror.status, "NORMAL");
  for (const change of [{ content: "Must not overwrite the page" }, { status: "ARCHIVED" }, { publicId: "PageOther" }]) {
    await assert.rejects(memories.update(mirror.publicId, change), error => error.code === "page_managed_memory");
  }
  await assert.rejects(memories.archive(mirror.publicId), error => error.code === "page_managed_memory");
  assert.equal((await memories.get(mirror.publicId)).content, draft.bodyMarkdown);
  await memories.incrementView(mirror.publicId);
  const menu = await db.menuItem.create({
    data: { uid: prefix, label: prefix, language: "en", type: "PAGE", targetValue: prefix },
  });
  await pages.update(prefix, { excerpt: "A summary" });
  assert.equal((await pages.update(prefix, pagePatchInput({ excerpt: "" }))).excerpt, "");
  const renamed = `${prefix}-renamed`;
  await pages.update(prefix, {
    slug: renamed,
    bodyMarkdown: "Updated\n\nFull body.",
    title: `${prefix} updated`,
  });
  assert.equal((await db.menuItem.findUnique({ where: { id: menu.id } })).targetValue, renamed);
  mirror = await memories.get(published.linkedMemoryId);
  assert.equal(mirror.content, "Updated\n\nFull body.");
  assert.equal(mirror.viewCount, 1);
  assert.equal(mirror.metadata.isLongForm, true);
  await pages.update(renamed, { status: "DRAFT" });
  assert.equal((await memories.get(mirror.publicId)).status, "PENDING");
  await pages.archive(renamed);
  assert.equal((await memories.get(mirror.publicId)).status, "ARCHIVED");
  await pages.update(renamed, { status: "PUBLISHED" });
  assert.equal((await memories.get(mirror.publicId)).id, mirror.id);
  const collision = await pages.create({ slug: `${prefix}-taken`, title: prefix, status: "DRAFT" });
  await assert.rejects(
    pages.update(renamed, { slug: collision.slug, bodyMarkdown: "must roll back" }),
    (error) => error.code === "page_slug_taken",
  );
  assert.equal((await pages.get(renamed)).bodyMarkdown, "Updated\n\nFull body.");
  assert.equal((await memories.get(mirror.publicId)).content, "Updated\n\nFull body.");
  await assert.rejects(
    pages.update(renamed, { bodyMarkdown: " " }),
    (error) => error.code === "empty_page_content",
  );
  assert.equal((await pages.get(renamed)).bodyMarkdown, "Updated\n\nFull body.");
  const asset = { url: `/${prefix}/photo.jpg`, type: "image/jpeg", metadata: { order: 0 } };
  const first = await memories.create({ title: prefix, content: "One", attachments: [asset] });
  const second = await memories.create({ title: prefix, content: "Two", attachments: [asset] });
  memoryIds.push(first.id, second.id);
  await memories.update(first.publicId, { attachments: [] });
  assert.equal(
    (await memories.get(second.publicId)).attachments.length,
    1,
    "Detaching a reused asset must preserve other memories",
  );
  console.log(
    "Admin workspace: transactional publish, concurrent publish, rename/menu integrity, archive/restore, rollback, shared media passed",
  );
} finally {
  await db.menuItem.deleteMany({ where: { uid: prefix } });
  await db.page.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.memory.deleteMany({
    where: { OR: [{ id: { in: memoryIds } }, { title: { startsWith: prefix } }] },
  });
  await db.mediaAsset.deleteMany({ where: { url: { contains: prefix } } });
  await db.$disconnect();
}
