import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrismaClient } from "../packages/database/dist/index.js";
import {
  PrismaAssetRepository,
  PrismaMemoryRepository,
  PrismaPageRepository,
} from "../apps/api/dist/prisma-repositories.js";
import { AssetService } from "../apps/api/dist/services.js";
import { createLocalStorage } from "../packages/storage/src/index.js";

const databaseUrl = process.env.I_REMEMBER_TEST_DATABASE_URL;
if (!databaseUrl || !/(?:test|review)/i.test(new URL(databaseUrl).pathname))
  throw new Error("Use a disposable test/review database");
process.env.DATABASE_URL = databaseUrl;
const db = createPrismaClient(),
  assets = new PrismaAssetRepository(db),
  memories = new PrismaMemoryRepository(db),
  pages = new PrismaPageRepository(db);
const prefix = `media-${randomBytes(6).toString("hex")}`,
  admin = { role: "ADMIN" };
const root = await mkdtemp(join(tmpdir(), prefix));
const storage = createLocalStorage({ rootDir: root }),
  service = new AssetService(assets, storage);
try {
  const file = {
    url: `/uploads/admin/${prefix}.jpg`,
    type: "image/jpeg",
    metadata: { filename: `${prefix}.jpg` },
  };
  await mkdir(join(root, "admin"));
  await writeFile(join(root, `admin/${prefix}.jpg`), "disposable media fixture");
  const independent = await assets.create(file);
  assert.equal((await service.detail(admin, independent.id)).usage.length, 0);
  const first = await memories.create({ title: prefix, content: "First", attachments: [file] });
  const second = await memories.create({ title: prefix, content: "Second", attachments: [file] });
  await pages.create({
    slug: prefix,
    title: prefix,
    bodyMarkdown: `![Photo](<${file.url}>)`,
    status: "PUBLISHED",
    navigationVisible: true,
  });
  assert.equal((await assets.usage(independent.id)).length, 3);
  assert.equal(
    (await db.menuItem.findFirst({ where: { targetValue: prefix, type: "PAGE" } })).isVisible,
    true,
  );
  await memories.update(first.publicId, { attachments: [] });
  await memories.update(second.publicId, { attachments: [] });
  assert.equal((await assets.usage(independent.id))[0].kind, "page");
  await assert.rejects(
    service.delete(admin, independent.id),
    (error) => error.code === "asset_in_use",
  );
  await access(join(root, `admin/${prefix}.jpg`));
  await pages.update(prefix, { status: "DRAFT", navigationVisible: false });
  await assert.rejects(
    service.delete(admin, independent.id),
    (error) => error.code === "asset_in_use",
    "Drafts must retain their media",
  );
  await pages.update(prefix, { bodyMarkdown: "No media now" });
  assert.ok(
    (await assets.list(40, undefined, { q: prefix, unused: true })).some(
      (item) => item.id === independent.id,
    ),
  );
  await service.delete(admin, independent.id);
  await assert.rejects(access(join(root, `admin/${prefix}.jpg`)));
  await assert.rejects(
    memories.update(second.publicId, { attachments: [file] }),
    (error) => error.code === "asset_deleted",
  );
  assert.equal(
    (await memories.get(second.publicId)).attachments.length,
    0,
    "A deleted-media reference must roll back the entire save",
  );

  const folder = `posts/revival-${randomBytes(6).toString("hex")}`;
  await mkdir(join(root, folder), { recursive: true });
  await writeFile(join(root, folder, "full.jpg"), "photo");
  await writeFile(join(root, folder, "video.mp4"), "motion");
  const pair = await assets.create({
    url: `/uploads/${folder}/resized.jpg`,
    type: "image/jpeg",
    metadata: { livePhoto: true },
  });
  assert.equal(
    (await assets.create({ url: `/uploads/${folder}/full.jpg`, type: "image/jpeg" })).id,
    pair.id,
  );
  await service.delete(admin, pair.id);
  await assert.rejects(access(join(root, folder)));
  await db.mediaAsset.delete({ where: { id: pair.id } });
  console.log(
    "Media library: independent files, shared Memory/Page ownership, draft protection, navigation toggle, detach/reuse, guarded deletion, rollback and grouped Live Photo cleanup passed",
  );
} finally {
  await db.menuItem.deleteMany({ where: { targetValue: prefix } });
  await db.page.deleteMany({ where: { slug: prefix } });
  await db.memory.deleteMany({ where: { title: prefix } });
  await db.mediaAsset.deleteMany({ where: { url: { contains: prefix } } });
  await db.$disconnect();
  await rm(root, { recursive: true, force: true });
}
