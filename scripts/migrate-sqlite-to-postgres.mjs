import assert from "node:assert/strict";
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

function memoryData(row) {
  const metadata = parseJson(row.metadata_json, {}) || {};
  return {
    id: row.uid,
    publicId: row.public_id,
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

  await prisma.$disconnect();
}

function summarize(rows) {
  return {
    users: rows.users.length,
    memories: rows.memories.length,
    attachments: rows.attachments.length,
    tags: new Set(rows.tags.map((row) => row.slug || slug(row.name))).size,
    memoryTags: new Set(rows.memoryTags.map((row) => `${row.memoryId}:${row.tagId}`)).size,
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
  assert.equal(memory.metadata.languageCode, "en");
  assert.equal(memory.metadata.mood, "quiet");
  assert.equal(tagRowsFromMemory(row)[0].slug, "test");
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
