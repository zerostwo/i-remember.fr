import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { pagePatchInput } from "../apps/api/dist/validation.js";
import { createPrismaClient } from "../packages/database/dist/index.js";
import {
  PrismaPageRepository,
  PrismaMemoryRepository,
  PrismaMenuItemRepository,
} from "../apps/api/dist/prisma-repositories.js";

import { PublicContentService } from "../apps/api/dist/services.js";

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
  const draftVersion = draft.updatedAt.toISOString();
  const edited = await pages.update(prefix, pagePatchInput({ expectedUpdatedAt: draftVersion, excerpt: "First save" }));
  await assert.rejects(
    pages.update(prefix, pagePatchInput({ expectedUpdatedAt: draftVersion, excerpt: "Stale autosave" })),
    error => error.code === "page_changed",
  );
  assert.equal((await pages.get(prefix)).excerpt, edited.excerpt);

  const [published, concurrent] = await Promise.all([
    pages.update(prefix, { status: "PUBLISHED" }),
    pages.update(prefix, { status: "PUBLISHED" }),
  ]);
  assert.equal(
    published.linkedMemoryId,
    concurrent.linkedMemoryId,
    "Concurrent publishing must create only one mirror",
  );
  await assert.rejects(
    pages.update(prefix, pagePatchInput({ expectedUpdatedAt: edited.updatedAt.toISOString(), status: "DRAFT" })),
    error => error.code === "page_changed",
  );
  assert.equal((await pages.get(prefix)).status, "PUBLISHED");
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
  const duplicateMenu = await db.menuItem.create({ data: { uid: prefix + "-second", label: prefix, language: "en", type: "PAGE", targetValue: prefix } });
  await pages.update(prefix, { navigationVisible: false });
  assert.equal(await db.menuItem.count({ where: { type: "PAGE", targetValue: prefix, isVisible: true } }), 0);
  await db.menuItem.delete({ where: { id: duplicateMenu.id } });
  const menus = new PrismaMenuItemRepository(db);
  const publicContent = new PublicContentService(menus, pages, memories);
  await pages.update(prefix, { navigationVisible: true });
  const automatic = await db.menuItem.findFirstOrThrow({ where: { uid: `page-${draft.id}` } });
  assert.equal((await db.menuItem.findUnique({ where: { id: menu.id } })).isVisible, false);
  await pages.update(prefix, { title: "About", navigationVisible: true });
  assert.equal((await db.menuItem.findUnique({ where: { id: automatic.id } })).label, "About");
  assert.equal((await db.menuItem.findUnique({ where: { id: menu.id } })).isVisible, false);
  const group = await menus.create({ uid: prefix + "-group", type: "GROUP", label: "Information" });
  await menus.update(automatic.id, { label: "About us", metadata: { parentId: group.id } });
  await pages.update(prefix, { title: "About us" });
  await pages.update(prefix, { title: "About the garden" });
  assert.equal((await db.menuItem.findUnique({ where: { id: automatic.id } })).label, "About us");
  const publicIds = async () => (await publicContent.menu()).map(item => item.id);
  assert.ok((await publicIds()).includes(group.id));
  await pages.archive(prefix);
  assert.ok(!(await publicIds()).includes(group.id));
  await assert.rejects(publicContent.target(automatic.id), error => error.statusCode === 404);
  await pages.update(prefix, { status: "PUBLISHED" });
  assert.ok((await publicIds()).includes(group.id));
  await menus.update(group.id, { isVisible: false });
  assert.ok(!(await publicIds()).includes(automatic.id));
  await menus.delete(group.id);
  const summaries = await pages.list("en", { limit: 1, summary: true });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].bodyMarkdown, undefined);
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
  await db.page.createMany({ data: Array.from({ length: 205 }, (_, index) => ({
    slug: `${prefix}-pagination-${index}`, title: prefix, language: "en", status: "DRAFT",
    bodyMarkdown: "Full body must not be present in list responses.",
  })) });
  let cursor;
  const listed = [];
  do {
    const batch = await pages.list("en", { limit: 40, cursor, summary: true });
    assert.ok(batch.length <= 40);
    assert.ok(batch.every(item => item.bodyMarkdown === undefined));
    listed.push(...batch);
    cursor = batch.length === 40 ? batch.at(-1).id : undefined;
  } while (cursor);
  assert.equal(listed.filter(item => item.slug.startsWith(`${prefix}-pagination-`)).length, 205);
  assert.equal(new Set(listed.map(item => item.id)).size, listed.length);
  console.log(
    "Admin workspace: transactional publish, concurrent publish, rename/menu integrity, archive/restore, rollback, shared media passed",
  );
} finally {
  await db.menuItem.deleteMany({ where: { OR: [{ uid: { startsWith: prefix } }, { targetValue: { startsWith: prefix } }] } });
  await db.page.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.memory.deleteMany({
    where: { OR: [{ id: { in: memoryIds } }, { title: { startsWith: prefix } }] },
  });
  await db.mediaAsset.deleteMany({ where: { url: { contains: prefix } } });
  await db.$disconnect();
}
