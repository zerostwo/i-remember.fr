import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { RevivalSQLiteStore } from "../src/server/sqlite-store.js";

const args = new Set(process.argv.slice(2));

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function date(value) {
  const next = new Date(value || Date.now());
  return Number.isNaN(next.getTime()) ? new Date() : next;
}

function enumValue(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function publicId(value) {
  const next = String(value || "").trim();
  return /^[A-Za-z][A-Za-z0-9]*$/.test(next) ? next : `m${randomBytes(10).toString("hex")}`;
}

function memoryData(row) {
  const metadata = parseJson(row.metadata_json, {}) || {};
  return {
    id: row.uid,
    publicId: publicId(row.public_id),
    legacyId: Number(row.legacy_id),
    title: String(row.title || row.name || "I Remember").slice(0, 180),
    content: String(row.body_markdown || row.text || ""),
    excerpt: row.excerpt || row.text || null,
    authorName: row.name || "Anonymous",
    visibility: enumValue(row.visibility, new Set(["PUBLIC", "UNLISTED", "PRIVATE"]), "PUBLIC"),
    status: enumValue(
      row.status,
      new Set(["NORMAL", "PENDING", "ARCHIVED", "REJECTED"]),
      "PENDING",
    ),
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    emotion: row.emotion || null,
    metadata: {
      ...metadata,
      languageCode: row.language_code,
      imageKey: row.image_key,
      source: row.source,
      contentFormat: row.content_format,
      isLongForm: Boolean(row.is_long_form),
    },
    embedding: parseJson(row.embedding_json, null),
    aiSummary: row.ai_summary || null,
    knowledgeGraph: parseJson(row.knowledge_graph_json, null),
    createdAt: date(row.created_at),
  };
}

function pageData(row) {
  const language = row.language_code || "en";
  const pageSlug = slug(row.slug) || `page-${row.id}`;
  return {
    id: `page_${language}_${pageSlug}`,
    slug: pageSlug,
    language,
    title: String(row.title || "Untitled page").slice(0, 180),
    excerpt: row.excerpt || null,
    bodyMarkdown: row.body_markdown || "",
    status: enumValue(row.status, new Set(["PUBLISHED", "DRAFT", "ARCHIVED"]), "DRAFT"),
    linkedMemoryId: row.linked_memory_uid || null,
    metadata: { legacyId: row.id },
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
  };
}

function menuItemData(row) {
  const language = row.language_code || "en";
  const uid = row.uid || `legacy-menu-${row.id}`;
  return {
    id: `menu_${language}_${uid}`,
    uid,
    language,
    label: String(row.label || "Menu item").slice(0, 120),
    type: enumValue(
      row.item_type,
      new Set(["PAGE", "MEMORY", "SEARCH", "EXTERNAL", "TERMS", "CREDITS", "LANGUAGE"]),
      "PAGE",
    ),
    targetValue: row.target_value || null,
    url: row.url || null,
    position: Number(row.position || 0),
    isVisible: row.is_visible !== 0,
    opensNewTab: row.opens_new_tab === 1,
    metadata: { legacyId: row.id },
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
  };
}

function settingData(row) {
  return {
    key: row.key,
    value: parseJson(row.value, row.value),
    updatedAt: date(row.updated_at),
  };
}

function tagRowsFromMemory(row) {
  const tags = parseJson(row.tags_json, {}) || {};
  return Object.keys(tags)
    .map((name) => ({ id: `tag_${slug(name)}`, name, slug: slug(name), memoryId: row.uid }))
    .filter((tag) => tag.slug);
}

function safeAll(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch {
    return [];
  }
}

function readSqlite() {
  const store = new RevivalSQLiteStore();
  const db = store.db;
  const memories = safeAll(db, "select * from memories order by id");
  const derivedTags = memories.flatMap(tagRowsFromMemory);
  const tags = [...safeAll(db, "select * from tags order by name"), ...derivedTags];
  const memoryTags = [
    ...safeAll(db, "select memory_uid as memoryId, tag_id as tagId from memory_tags"),
    ...derivedTags.map((tag) => ({ memoryId: tag.memoryId, tagId: tag.id })),
  ];
  const rows = {
    users: safeAll(db, "select * from users order by created_at"),
    memories,
    attachments: safeAll(db, "select * from attachments order by created_at"),
    tags,
    memoryTags,
    pages: safeAll(db, "select * from pages order by language_code, slug"),
    menuItems: safeAll(db, "select * from menu_items order by language_code, position, id"),
    settings: safeAll(db, "select * from app_settings order by key"),
  };
  const source = { dbPath: store.dbPath, dataDir: store.dataDir };
  store.close();
  return { rows, source };
}

async function importRows(rows) {
  const { getPrismaClient } = await import("@i-remember/database");
  const prisma = getPrismaClient();

  for (const row of rows.users) {
    await prisma.user.upsert({
      where: { email: row.email },
      update: {
        passwordHash: row.password_hash,
        role: enumValue(row.role, new Set(["ADMIN", "USER", "ANONYMOUS"]), "USER"),
      },
      create: {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        role: enumValue(row.role, new Set(["ADMIN", "USER", "ANONYMOUS"]), "USER"),
        createdAt: date(row.created_at),
      },
    });
  }

  for (const row of rows.memories) {
    const data = memoryData(row);
    const update = { ...data };
    delete update.id;
    delete update.publicId;
    delete update.createdAt;
    await prisma.memory.upsert({
      where: { publicId: data.publicId },
      update,
      create: data,
    });
  }

  for (const row of rows.tags) {
    const data = {
      id: row.id,
      name: row.name,
      slug: row.slug || slug(row.name),
      createdAt: date(row.created_at),
    };
    if (!data.slug) continue;
    await prisma.tag.upsert({
      where: { slug: data.slug },
      update: { name: data.name },
      create: data,
    });
  }

  for (const row of rows.attachments) {
    await prisma.attachment.upsert({
      where: { id: row.id },
      update: {
        url: row.url,
        type: row.type,
        metadata: parseJson(row.metadata_json, null),
      },
      create: {
        id: row.id,
        memoryId: row.memory_uid,
        url: row.url,
        type: row.type,
        metadata: parseJson(row.metadata_json, null),
        createdAt: date(row.created_at),
      },
    });
  }

  for (const row of rows.memoryTags) {
    await prisma.memoryTag.upsert({
      where: { memoryId_tagId: { memoryId: row.memoryId, tagId: row.tagId } },
      update: {},
      create: {
        memoryId: row.memoryId,
        tagId: row.tagId,
        createdAt: date(row.created_at),
      },
    });
  }

  for (const row of rows.pages) {
    const data = pageData(row);
    const update = { ...data };
    delete update.id;
    delete update.createdAt;
    await prisma.page.upsert({
      where: { language_slug: { language: data.language, slug: data.slug } },
      update,
      create: data,
    });
  }

  for (const row of rows.menuItems) {
    const data = menuItemData(row);
    const update = { ...data };
    delete update.id;
    delete update.createdAt;
    await prisma.menuItem.upsert({
      where: { language_uid: { language: data.language, uid: data.uid } },
      update,
      create: data,
    });
  }

  for (const row of rows.settings) {
    const data = settingData(row);
    await prisma.appSetting.upsert({
      where: { key: data.key },
      update: { value: data.value },
      create: data,
    });
  }

  await prisma.$disconnect();
}

function summarize(rows) {
  return {
    users: rows.users.length,
    memories: rows.memories.length,
    attachments: rows.attachments.length,
    tags: new Set(rows.tags.map((row) => row.slug || slug(row.name))).size,
    memoryTags: new Set(rows.memoryTags.map((row) => `${row.memoryId}:${row.tagId}`)).size,
    pages: rows.pages.length,
    menuItems: rows.menuItems.length,
    settings: rows.settings.length,
  };
}

function selfCheck() {
  const row = {
    uid: "mem_en_1",
    public_id: "abc123",
    legacy_id: 1,
    language_code: "en",
    name: "Ada",
    text: "I remember tests.",
    tags_json: '{"test":1}',
    metadata_json: '{"mood":"quiet"}',
    status: "NORMAL",
    visibility: "PUBLIC",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const memory = memoryData(row);
  assert.equal(memory.id, "mem_en_1");
  assert.equal(memory.publicId, "abc123");
  assert.match(memoryData({ ...row, public_id: "12345" }).publicId, /^m[a-f0-9]{20}$/);
  assert.equal(memory.metadata.languageCode, "en");
  assert.equal(memory.metadata.mood, "quiet");
  assert.equal(tagRowsFromMemory(row)[0].slug, "test");
  assert.equal(
    pageData({ id: 2, slug: "About", language_code: "en", title: "About" }).id,
    "page_en_about",
  );
  assert.equal(
    menuItemData({ id: 3, uid: "credits", language_code: "en", label: "Credits" }).type,
    "PAGE",
  );
  assert.equal(settingData({ key: "site.tracking_enabled", value: "true" }).value, true);
  console.log("legacy migration mapper ok");
}

if (args.has("--self-check")) {
  selfCheck();
} else {
  const { rows, source } = readSqlite();
  const counts = summarize(rows);
  console.log(`SQLite source: ${source.dbPath}`);
  console.log(JSON.stringify(counts, null, 2));
  if (args.has("--dry-run")) {
    console.log("Dry run only; no PostgreSQL writes.");
  } else {
    await importRows(rows);
    console.log("PostgreSQL import complete.");
  }
}
