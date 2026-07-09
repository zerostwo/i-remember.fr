import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const migrationDir = join(rootDir, "src", "server", "migrations", "sqlite");
const dockerDataDir = "/var/opt/i-remember";
const defaultDataDir = ".revival-data";

function writableDir(path) {
  try {
    if (!existsSync(path) || !statSync(path).isDirectory()) return false;
    const testPath = join(path, ".write-test");
    writeFileSync(testPath, "test", { mode: 0o600 });
    unlinkSync(testPath);
    return true;
  } catch (error) {
    return false;
  }
}

export function resolveDataDir(value = process.env.I_REMEMBER_DATA_DIR) {
  const configured = String(value || "").trim();
  if (configured) return isAbsolute(configured) ? configured : resolve(rootDir, configured);
  if (writableDir(dockerDataDir)) return dockerDataDir;
  return resolve(rootDir, defaultDataDir);
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function boolToInt(value) {
  return value === false || value === "0" || value === 0 ? 0 : 1;
}

function rowToMemory(row) {
  if (!row) return null;
  return {
    ...row,
    has_created_tags: Boolean(row.has_created_tags),
    is_stared: Boolean(row.is_stared),
    fallback: Boolean(row.fallback),
    tags: parseJson(row.tags_json),
  };
}

function rowToImage(row) {
  if (!row) return null;
  return {
    ...row,
    fallback: Boolean(row.fallback),
  };
}

function rowToPage(row) {
  if (!row) return null;
  return {
    ...row,
  };
}

function rowToMenuItem(row) {
  if (!row) return null;
  return {
    ...row,
    is_visible: Boolean(row.is_visible),
    opens_new_tab: Boolean(row.opens_new_tab),
  };
}

export class RevivalSQLiteStore {
  constructor(options = {}) {
    this.dataDir = resolveDataDir(options.dataDir);
    this.dbPath = resolve(
      options.dbPath ||
        process.env.I_REMEMBER_DB ||
        join(this.dataDir, "i-remember.sqlite"),
    );
    this.uploadsDir = resolve(
      options.uploadsDir ||
        process.env.I_REMEMBER_UPLOADS_DIR ||
        join(this.dataDir, "uploads"),
    );

    mkdirSync(this.dataDir, { recursive: true, mode: 0o770 });
    mkdirSync(this.uploadsDir, { recursive: true, mode: 0o770 });
    mkdirSync(dirname(this.dbPath), { recursive: true, mode: 0o770 });

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    this.prepareStatements();
  }

  close() {
    this.db.close();
  }

  migrate() {
    this.db.exec(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    const applied = new Set(
      this.db
        .prepare("select version from schema_migrations")
        .all()
        .map((row) => row.version),
    );

    const files = readdirSync(migrationDir)
      .filter((file) => /^\d+_.*\.sql$/i.test(file))
      .sort();

    const apply = this.db.transaction((file) => {
      const sql = readFileSync(join(migrationDir, file), "utf8");
      this.db.exec(sql);
      this.db
        .prepare("insert or ignore into schema_migrations (version) values (?)")
        .run(file);
    });

    for (const file of files) {
      if (!applied.has(file)) apply(file);
    }
  }

  prepareStatements() {
    this.statements = {
      listMemories: this.db.prepare(`
        select * from memories
        where language_code = ? and status = 'NORMAL'
        order by legacy_id desc
        limit ?
      `),
      listAllMemories: this.db.prepare(`
        select * from memories
        where language_code = ?
        order by
          case status
            when 'PENDING' then 0
            when 'NORMAL' then 1
            when 'ARCHIVED' then 2
            else 3
          end,
          legacy_id desc
        limit ?
      `),
      getMemory: this.db.prepare(`
        select * from memories
        where language_code = ? and legacy_id = ? and status = 'NORMAL'
        limit 1
      `),
      getMemoryByRowId: this.db.prepare(`
        select * from memories
        where id = ?
        limit 1
      `),
      getMemoryByUid: this.db.prepare(`
        select * from memories
        where uid = ?
        limit 1
      `),
      getMemoryByPublicId: this.db.prepare(`
        select * from memories
        where public_id = ? and status = 'NORMAL'
        limit 1
      `),
      maxLegacyId: this.db.prepare(`
        select max(legacy_id) as max_id from memories where language_code = ?
      `),
      upsertMemory: this.db.prepare(`
        insert into memories (
          uid,
          legacy_id,
          public_id,
          language_code,
          name,
          text,
          image_key,
          img_offset_x,
          img_offset_y,
          resized_img_width,
          resized_img_height,
          has_created_tags,
          is_stared,
          tags_json,
          metadata_json,
          title,
          excerpt,
          body_markdown,
          content_format,
          is_long_form,
          source,
          status,
          created_at,
          updated_at
        ) values (
          @uid,
          @legacy_id,
          @public_id,
          @language_code,
          @name,
          @text,
          @image_key,
          @img_offset_x,
          @img_offset_y,
          @resized_img_width,
          @resized_img_height,
          @has_created_tags,
          @is_stared,
          @tags_json,
          @metadata_json,
          @title,
          @excerpt,
          @body_markdown,
          @content_format,
          @is_long_form,
          @source,
          @status,
          @created_at,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
        on conflict(language_code, legacy_id) do update set
          name = excluded.name,
          text = excluded.text,
          image_key = excluded.image_key,
          img_offset_x = excluded.img_offset_x,
          img_offset_y = excluded.img_offset_y,
          resized_img_width = excluded.resized_img_width,
          resized_img_height = excluded.resized_img_height,
          has_created_tags = excluded.has_created_tags,
          is_stared = excluded.is_stared,
          tags_json = excluded.tags_json,
          metadata_json = excluded.metadata_json,
          title = excluded.title,
          excerpt = excluded.excerpt,
          body_markdown = excluded.body_markdown,
          content_format = excluded.content_format,
          is_long_form = excluded.is_long_form,
          source = excluded.source,
          status = excluded.status,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        returning *
      `),
      insertMemory: this.db.prepare(`
        insert into memories (
          uid,
          legacy_id,
          public_id,
          language_code,
          name,
          text,
          image_key,
          img_offset_x,
          img_offset_y,
          resized_img_width,
          resized_img_height,
          has_created_tags,
          is_stared,
          tags_json,
          metadata_json,
          title,
          excerpt,
          body_markdown,
          content_format,
          is_long_form,
          source,
          status,
          created_at,
          updated_at
        ) values (
          @uid,
          @legacy_id,
          @public_id,
          @language_code,
          @name,
          @text,
          @image_key,
          @img_offset_x,
          @img_offset_y,
          @resized_img_width,
          @resized_img_height,
          @has_created_tags,
          @is_stared,
          @tags_json,
          @metadata_json,
          @title,
          @excerpt,
          @body_markdown,
          @content_format,
          @is_long_form,
          @source,
          @status,
          @created_at,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
        returning *
      `),
      getImage: this.db.prepare("select * from memory_images where image_key = ? limit 1"),
      upsertImage: this.db.prepare(`
        insert into memory_images (
          image_key,
          storage_type,
          original_path,
          resized_path,
          thumb_path,
          mime_type,
          width,
          height,
          sha256,
          fallback,
          updated_at
        ) values (
          @image_key,
          @storage_type,
          @original_path,
          @resized_path,
          @thumb_path,
          @mime_type,
          @width,
          @height,
          @sha256,
          @fallback,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
        on conflict(image_key) do update set
          storage_type = excluded.storage_type,
          original_path = excluded.original_path,
          resized_path = excluded.resized_path,
          thumb_path = excluded.thumb_path,
          mime_type = excluded.mime_type,
          width = excluded.width,
          height = excluded.height,
          sha256 = excluded.sha256,
          fallback = excluded.fallback,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `),
      upsertPage: this.db.prepare(`
        insert into pages (
          slug,
          language_code,
          title,
          excerpt,
          body_markdown,
          metadata_json,
          status,
          linked_memory_uid,
          updated_at
        ) values (
          @slug,
          @language_code,
          @title,
          @excerpt,
          @body_markdown,
          @metadata_json,
          @status,
          @linked_memory_uid,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
        on conflict(language_code, slug) do update set
          title = excluded.title,
          excerpt = excluded.excerpt,
          body_markdown = excluded.body_markdown,
          metadata_json = excluded.metadata_json,
          status = excluded.status,
          linked_memory_uid = excluded.linked_memory_uid,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        returning *
      `),
      listPages: this.db.prepare(`
        select * from pages
        where language_code = ?
        order by slug
      `),
      getPage: this.db.prepare(`
        select * from pages
        where language_code = ? and slug = ?
        limit 1
      `),
      upsertMenuItem: this.db.prepare(`
        insert into menu_items (
          uid,
          language_code,
          label,
          item_type,
          target_value,
          url,
          position,
          is_visible,
          opens_new_tab,
          updated_at
        ) values (
          @uid,
          @language_code,
          @label,
          @item_type,
          @target_value,
          @url,
          @position,
          @is_visible,
          @opens_new_tab,
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
        on conflict(language_code, uid) do update set
          label = excluded.label,
          item_type = excluded.item_type,
          target_value = excluded.target_value,
          url = excluded.url,
          position = excluded.position,
          is_visible = excluded.is_visible,
          opens_new_tab = excluded.opens_new_tab,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        returning *
      `),
      updateMenuItemById: this.db.prepare(`
        update menu_items set
          label = @label,
          item_type = @item_type,
          target_value = @target_value,
          url = @url,
          position = @position,
          is_visible = @is_visible,
          opens_new_tab = @opens_new_tab,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        where id = @id
        returning *
      `),
      listMenuItems: this.db.prepare(`
        select * from menu_items
        where language_code = ?
        order by position, id
      `),
      listVisibleMenuItems: this.db.prepare(`
        select * from menu_items
        where language_code = ? and is_visible = 1
        order by position, id
      `),
      getMenuItem: this.db.prepare(`
        select * from menu_items
        where id = ?
        limit 1
      `),
      deleteMenuItem: this.db.prepare(`
        delete from menu_items
        where id = ?
      `),
      listImages: this.db.prepare(`
        select * from memory_images
        order by updated_at desc
        limit ?
      `),
      getSetting: this.db.prepare(`
        select value from app_settings
        where key = ?
        limit 1
      `),
      setSetting: this.db.prepare(`
        insert into app_settings (key, value, updated_at)
        values (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        on conflict(key) do update set
          value = excluded.value,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `),
    };
  }

  normalizeMemoryRow(row, fallbackStatus = "NORMAL") {
    return {
      uid: row.uid || `mem_${row.language_code}_${row.legacy_id}`,
      legacy_id: Number(row.legacy_id),
      public_id: String(row.public_id || randomPublicId()),
      language_code: row.language_code,
      name: String(row.name || "I Remember").slice(0, 120),
      text: String(row.text || "").slice(0, 2000),
      image_key: row.image_key || "revival-upload",
      img_offset_x: Number(row.img_offset_x || 0),
      img_offset_y: Number(row.img_offset_y || 0),
      resized_img_width: Number(row.resized_img_width || 600),
      resized_img_height: Number(row.resized_img_height || 600),
      has_created_tags: boolToInt(row.has_created_tags),
      is_stared: boolToInt(row.is_stared),
      tags_json: row.tags ? JSON.stringify(row.tags) : row.tags_json || null,
      metadata_json: row.metadata_json || null,
      title: String(row.title || row.name || "I Remember").slice(0, 180),
      excerpt: String(row.excerpt || row.text || "").slice(0, 600),
      body_markdown: String(row.body_markdown || row.text || "").slice(0, 50000),
      content_format: row.content_format === "markdown" ? "markdown" : "plain",
      is_long_form: boolToInt(row.is_long_form),
      source: row.source || "archive",
      status: row.status || fallbackStatus,
      created_at: row.created_at || new Date().toISOString(),
    };
  }

  upsertMemory(row, fallbackStatus = "NORMAL") {
    return rowToMemory(this.statements.upsertMemory.get(this.normalizeMemoryRow(row, fallbackStatus)));
  }

  insertMemory(row, fallbackStatus = "PENDING") {
    return rowToMemory(this.statements.insertMemory.get(this.normalizeMemoryRow(row, fallbackStatus)));
  }

  listMemories(language, limit = 5000) {
    return this.statements.listMemories.all(language, limit).map(rowToMemory);
  }

  listAllMemories(language, limit = 200) {
    return this.statements.listAllMemories.all(language, limit).map(rowToMemory);
  }

  getMemory(language, legacyId) {
    return rowToMemory(this.statements.getMemory.get(language, legacyId));
  }

  getMemoryByRowId(id) {
    return rowToMemory(this.statements.getMemoryByRowId.get(id));
  }

  getMemoryByUid(uid) {
    return rowToMemory(this.statements.getMemoryByUid.get(uid));
  }

  getMemoryByPublicId(publicId) {
    return rowToMemory(this.statements.getMemoryByPublicId.get(String(publicId || "")));
  }

  nextLegacyId(language) {
    const maxId = Number(this.statements.maxLegacyId.get(language)?.max_id || 9000);
    return Math.max(maxId + 1, 9001);
  }

  upsertImage(row) {
    this.statements.upsertImage.run({
      image_key: row.image_key,
      storage_type: row.storage_type || "ARCHIVE",
      original_path: row.original_path || null,
      resized_path: row.resized_path || null,
      thumb_path: row.thumb_path || null,
      mime_type: row.mime_type || "image/jpeg",
      width: row.width || null,
      height: row.height || null,
      sha256: row.sha256 || null,
      fallback: row.fallback ? 1 : 0,
    });
  }

  getImage(imageKey) {
    return rowToImage(this.statements.getImage.get(imageKey));
  }

  normalizePage(row) {
    const slug = String(row.slug || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return {
      slug: slug || "page",
      language_code: row.language_code,
      title: String(row.title || "Untitled page").slice(0, 180),
      excerpt: String(row.excerpt || "").slice(0, 600),
      body_markdown: String(row.body_markdown || "").slice(0, 50000),
      metadata_json: row.metadata_json || null,
      status: ["PUBLISHED", "DRAFT", "ARCHIVED"].includes(row.status)
        ? row.status
        : "DRAFT",
      linked_memory_uid: row.linked_memory_uid || null,
    };
  }

  upsertPage(row) {
    return rowToPage(this.statements.upsertPage.get(this.normalizePage(row)));
  }

  listPages(language) {
    return this.statements.listPages.all(language).map(rowToPage);
  }

  getPage(language, slug) {
    return rowToPage(this.statements.getPage.get(language, slug));
  }

  normalizeMenuItem(row) {
    return {
      uid: row.uid || `menu_${row.language_code}_${randomishId()}`,
      language_code: row.language_code,
      label: String(row.label || "Menu item").slice(0, 80),
      item_type: [
        "PAGE",
        "MEMORY",
        "SEARCH",
        "EXTERNAL",
        "TERMS",
        "CREDITS",
        "LANGUAGE",
      ].includes(row.item_type)
        ? row.item_type
        : "PAGE",
      target_value: row.target_value ? String(row.target_value).slice(0, 200) : null,
      url: row.url ? String(row.url).slice(0, 500) : null,
      position: Number.parseInt(row.position || "0", 10) || 0,
      is_visible: boolToInt(row.is_visible),
      opens_new_tab: boolToInt(row.opens_new_tab),
    };
  }

  upsertMenuItem(row) {
    return rowToMenuItem(this.statements.upsertMenuItem.get(this.normalizeMenuItem(row)));
  }

  updateMenuItemById(id, row) {
    return rowToMenuItem(
      this.statements.updateMenuItemById.get({
        ...this.normalizeMenuItem(row),
        id,
      }),
    );
  }

  listMenuItems(language, { visibleOnly = false } = {}) {
    const statement = visibleOnly
      ? this.statements.listVisibleMenuItems
      : this.statements.listMenuItems;
    return statement.all(language).map(rowToMenuItem);
  }

  getMenuItem(id) {
    return rowToMenuItem(this.statements.getMenuItem.get(id));
  }

  deleteMenuItem(id) {
    this.statements.deleteMenuItem.run(id);
  }

  listImages(limit = 80) {
    return this.statements.listImages.all(limit).map(rowToImage);
  }

  getSetting(key, fallback = null) {
    const row = this.statements.getSetting.get(key);
    if (!row) return fallback;
    return row.value;
  }

  setSetting(key, value) {
    this.statements.setSetting.run(key, String(value ?? ""));
  }

  setSettings(values = {}) {
    const save = this.db.transaction((entries) => {
      for (const [key, value] of entries) this.setSetting(key, value);
    });
    save(Object.entries(values));
  }

}

function randomishId() {
  return Math.random().toString(36).slice(2, 10);
}

function randomPublicId() {
  return randomBytes(10).toString("hex");
}
