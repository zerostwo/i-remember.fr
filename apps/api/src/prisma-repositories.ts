import { createHash, randomInt } from "node:crypto";
import { getPrismaClient } from "@i-remember/database";
import type {
  AttachmentInput,
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
  UserCreateInput,
  UserRecord,
  UserUpdateInput,
} from "./domain.js";
import { ApiError } from "./errors.js";
import { mediaStorageKey, registerMedia, syncMediaReferences } from "./media.js";
import type {
  AssetRepository,
  AssetListQuery,
  CommentListQuery,
  CommentRepository,
  MenuItemRepository,
  MemoryListQuery,
  MemoryRepository,
  PageRepository,
  ReadinessRepository,
  SettingRepository,
  UserRepository,
} from "./repositories.js";

const memoryInclude = {
  attachments: { orderBy: { createdAt: "asc" } },
  tags: { include: { tag: true }, orderBy: { createdAt: "asc" } },
} as const;

function publicIdConflict(error: any) {
  const fields = error.meta?.target || error.meta?.driverAdapterError?.cause?.constraint?.fields;
  return error.code === "P2002" && String(fields).includes("public_id");
}

export function createPublicMemoryId() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const alphabet = letters + "0123456789";
  return letters[randomInt(letters.length)] + Array.from({ length: 7 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

// Unicode names remain distinct; the digest also disambiguates punctuation and truncation.
export function tagSlug(name: string) {
  const normalized = name.normalize("NFKC").trim().toLocaleLowerCase("en");
  const base = normalized
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "tag"}-${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`;
}

async function tagCreates(prisma: any, tags: string[] = []) {
  const unique = new Map(tags.map((name) => [tagSlug(name), name]));
  const existing = await prisma.tag.findMany({
    where: { OR: [{ name: { in: [...unique.values()] } }, { slug: { in: [...unique.keys()] } }] },
  });
  return [...unique].map(([slug, name]) => ({
    tag: existing.find((tag: any) => tag.name === name || tag.slug === slug)
      ? { connect: { id: existing.find((tag: any) => tag.name === name || tag.slug === slug).id } }
      : {
          connectOrCreate: {
            where: { name },
            create: { name, slug },
          },
        },
  }));
}

function attachmentCreates(attachments: AttachmentInput[] = []) {
  return attachments.map((attachment) => ({
    url: attachment.url,
    type: attachment.type || "application/octet-stream",
    metadata: attachment.metadata as any,
  }));
}

function attachmentChanges(existing: MemoryRecord, attachments: AttachmentInput[]) {
  const ownedIds = new Set(existing.attachments?.map((attachment) => attachment.id));
  const retainedIds = new Set<string>();
  for (const attachment of attachments) {
    if (!attachment.id) continue;
    if (!ownedIds.has(attachment.id) || retainedIds.has(attachment.id)) {
      throw new ApiError(
        400,
        "Invalid attachment identity for this memory",
        "invalid_attachment_id",
      );
    }
    retainedIds.add(attachment.id);
  }
  // Keep retained rows stable so editing one attachment does not invalidate all
  // attachment identities, timestamps, and pagination cursors for the memory.
  return {
    deleteMany: { id: { notIn: [...retainedIds] } },
    update: attachments
      .filter((attachment) => attachment.id)
      .map((attachment) => ({
        where: { id: attachment.id! },
        data: attachmentCreates([attachment])[0],
      })),
    create: attachmentCreates(attachments.filter((attachment) => !attachment.id)),
  };
}

function memory(row: any): MemoryRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    // Keep the original map identity even when the public URL changes.
    mapId: String(Number.parseInt(/^m[a-f0-9]{20}$/.test(row.mapKey)
      ? row.mapKey.slice(1, 14)
      : createHash("sha256").update(row.mapKey || row.publicId).digest("hex").slice(0, 13), 16)),
    title: row.title,
    content: row.content,
    excerpt: row.excerpt,
    authorId: row.authorId,
    authorName: row.authorName,
    visibility: row.visibility,
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    emotion: row.emotion,
    metadata: row.metadata,
    embedding: Array.isArray(row.embedding) ? row.embedding.map(Number) : null,
    aiSummary: row.aiSummary,
    knowledgeGraph:
      row.knowledgeGraph && typeof row.knowledgeGraph === "object" ? row.knowledgeGraph : null,
    viewCount: Number(row.viewCount || 0),
    attachments: (row.attachments || []).map((attachment: any) => ({
      id: attachment.id,
      memoryId: attachment.memoryId,
      url: attachment.url,
      type: attachment.type,
      metadata:
        attachment.metadata && typeof attachment.metadata === "object" ? attachment.metadata : null,
      createdAt: attachment.createdAt,
    })),
    tags: (row.tags || []).map(({ tag }: any) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function page(row: any): PageRecord {
  return {
    id: row.id,
    slug: row.slug,
    language: row.language,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.bodyMarkdown,
    status: row.status,
    linkedMemoryId: row.linkedMemoryId,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function menuItem(row: any): MenuItemRecord {
  return {
    id: row.id,
    uid: row.uid,
    language: row.language,
    label: row.label,
    type: row.type,
    targetValue: row.targetValue,
    url: row.url,
    position: row.position,
    isVisible: row.isVisible,
    opensNewTab: row.opensNewTab,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function setting(row: any): SettingRecord {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt,
  };
}

function comment(row: any): CommentRecord {
  return {
    id: row.id,
    memoryId: row.memoryId,
    memoryPublicId: row.memory?.publicId,
    memoryTitle: row.memory?.title,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    content: row.content,
    status: row.status,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function user(row: any): UserRecord {
  const recoveryCodes = Array.isArray(row.twoFactorRecoveryCodes)
    ? row.twoFactorRecoveryCodes.filter((item: unknown) => typeof item === "string")
    : null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    twoFactorSecret: row.twoFactorSecret,
    twoFactorEnabled: Boolean(row.twoFactorEnabled),
    twoFactorRecoveryCodes: recoveryCodes,
    createdAt: row.createdAt,
  };
}

function memoryWhere(query: MemoryListQuery) {
  const q = query.q?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return {
    ...(query.status === "all" ? {} : { status: query.status || "NORMAL" }),
    ...(query.visibility === "all" ? {} : { visibility: query.visibility || "PUBLIC" }),
    ...(query.longForm ? { metadata: { path: ["isLongForm"], equals: true } } : {}),
    ...(q
      ? {
          OR: [
            { searchText: { contains: q } },
            {
              tags: {
                some: {
                  tag: {
                    OR: [
                      { name: { contains: q, mode: "insensitive" } },
                      { slug: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
}

function commentWhere(query: CommentListQuery) {
  const q = query.q?.trim();
  const and = [];
  if (query.memoryId) {
    and.push({
      OR: [{ memoryId: query.memoryId }, { memory: { is: { publicId: query.memoryId } } }],
    });
  }
  if (q) {
    and.push({
      OR: [
        { content: { contains: q, mode: "insensitive" } },
        { authorName: { contains: q, mode: "insensitive" } },
        { authorEmail: { contains: q, mode: "insensitive" } },
        { memory: { is: { title: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  return {
    ...(query.status === "all" ? {} : { status: query.status || "PENDING" }),
    ...(and.length ? { AND: and } : {}),
  };
}

export class PrismaMemoryRepository implements MemoryRepository {
  constructor(private readonly db = getPrismaClient()) {}

  private async assertEditable(tx: any, record: MemoryRecord) {
    const links = await tx.memoryLink.findMany({ where: { memoryId: record.id }, select: { publicId: true } });
    const owner = await tx.page.findFirst({
      where: { linkedMemoryId: { in: [record.id, record.publicId, ...links.map((link: any) => link.publicId)] } },
      select: { slug: true },
    });
    if (owner) throw new ApiError(409, `This memory belongs to the page “${owner.slug}”. Edit or archive it in Pages.`, "page_managed_memory");
  }

  async list(query: MemoryListQuery) {
    const rows = await this.db.memory.findMany({
      where: memoryWhere(query) as any,
      include: memoryInclude, omit: { searchText: true },
      orderBy: [...(query.sort ? [{ viewCount: query.sort === "views_asc" ? "asc" as const : "desc" as const }] : []), { createdAt: "desc" }, { publicId: "desc" }],
      ...(query.cursor ? { cursor: { publicId: query.cursor }, skip: 1 } : { skip: query.offset || 0 }),
      take: Math.min(query.limit || 100, 201),
    });
    return rows.map(memory);
  }

  async count(query: MemoryListQuery) {
    return this.db.memory.count({ where: memoryWhere(query) as any });
  }

  async random(exclude: string[]) {
    const where = { status: "NORMAL" as const, visibility: "PUBLIC" as const, publicId: { notIn: exclude }, content: { not: "" } };
    const count = await this.db.memory.count({ where });
    if (!count) return null;
    const row = await this.db.memory.findFirst({ where, skip: randomInt(count), orderBy: { publicId: "asc" }, include: memoryInclude, omit: { searchText: true } });
    return row ? memory(row) : null;
  }

  async get(id: string) {
    const row = await this.db.memory.findFirst({
      where: {
        OR: [{ id }, { publicId: id }, { links: { some: { publicId: id } } }],
      },
      include: memoryInclude, omit: { searchText: true },
    });
    return row ? memory(row) : null;
  }

  async create(input: MemoryInput) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const publicId = input.publicId || createPublicMemoryId();
      try {
        return await this.db.$transaction(async (tx) => {
          if (await tx.memory.findUnique({ where: { id: publicId } })) {
            throw new ApiError(409, "This public ID is already in use. Choose another.", "public_id_taken");
          }
          const saved = await tx.memory.create({
            data: {
              publicId,
              mapKey: publicId,
              links: { create: { publicId } },
              title: input.title,
              content: input.content,
              excerpt: input.content.slice(0, 220),
              authorId: input.authorId,
              authorName: input.authorName || "Anonymous",
              visibility: input.visibility || "PUBLIC",
              status: input.status || "NORMAL",
              latitude: input.latitude,
              longitude: input.longitude,
              emotion: input.emotion,
              metadata: { ...input.metadata, isLongForm: input.content.length > 220 } as any,
              embedding: input.embedding as any,
              aiSummary: input.aiSummary,
              knowledgeGraph: input.knowledgeGraph as any,
              attachments: input.attachments?.length ? { create: attachmentCreates(input.attachments) } : undefined,
              tags: input.tags?.length ? { create: await tagCreates(tx, input.tags) } : undefined,
            },
            include: memoryInclude, omit: { searchText: true },
          });
          await syncMediaReferences(tx, { memoryId: saved.id }, saved.content, input.attachments);
          return memory(saved);
        });
      } catch (error: any) {
        if (!publicIdConflict(error)) throw error;
        if (input.publicId) throw new ApiError(409, "This public ID is already in use. Choose another.", "public_id_taken");
      }
    }
    throw new ApiError(503, "Unable to allocate a link. Please try again.", "public_id_unavailable");
  }

  async incrementView(id: string) {
    const existing = await this.get(id);
    if (!existing || existing.status !== "NORMAL" || !["PUBLIC", "UNLISTED"].includes(existing.visibility)) {
      throw new ApiError(404, "Memory not found", "not_found");
    }
    return memory(
      await this.db.memory.update({
        where: { id: existing.id },
        data: { viewCount: { increment: 1 } },
        include: memoryInclude, omit: { searchText: true },
      }),
    );
  }

  async update(id: string, input: MemoryUpdateInput) {
    const existing = await this.get(id);
    if (!existing) throw new ApiError(404, "Memory not found", "not_found");
    try {
      return await this.db.$transaction(async (tx) => {
        await this.assertEditable(tx, existing);
        if (input.publicId && input.publicId !== existing.publicId) {
          const reserved = await tx.memoryLink.findUnique({ where: { publicId: input.publicId } });
          const internal = await tx.memory.findUnique({ where: { id: input.publicId } });
          if ((reserved && reserved.memoryId !== existing.id) || (internal && internal.id !== existing.id)) {
            throw new ApiError(409, "This public ID is already in use. Choose another.", "public_id_taken");
          }
          if (!reserved) await tx.memoryLink.create({ data: { publicId: input.publicId, memoryId: existing.id } });
        }
        const data: any = {
          publicId: input.publicId,
          title: input.title,
          content: input.content,
          excerpt: input.content ? input.content.slice(0, 220) : undefined,
          authorId: input.authorId,
          authorName: input.authorName,
          visibility: input.visibility,
          latitude: input.latitude,
          longitude: input.longitude,
          emotion: input.emotion,
          status: input.status,
          metadata: { ...(input.metadata || existing.metadata), isLongForm: (input.content ?? existing.content).length > 220 } as any,
          embedding: input.embedding as any,
          aiSummary: input.aiSummary,
          knowledgeGraph: input.knowledgeGraph as any,
        };
        if (input.attachments) data.attachments = attachmentChanges(existing, input.attachments);
        if (input.tags) data.tags = { deleteMany: {}, create: await tagCreates(tx, input.tags) };
        const saved = await tx.memory.update({ where: { id: existing.id }, data, include: memoryInclude, omit: { searchText: true } });
        await syncMediaReferences(tx, { memoryId: saved.id }, saved.content, saved.attachments as AttachmentInput[]);
        return memory(saved);
      });
    } catch (error: any) {
      if (publicIdConflict(error)) {
        throw new ApiError(409, "This public ID is already in use. Choose another.", "public_id_taken");
      }
      throw error;
    }
  }

  async archive(id: string) {
    return this.update(id, { status: "ARCHIVED" });
  }
}

export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(query: CommentListQuery) {
    const rows = await this.db.comment.findMany({
      where: commentWhere(query) as any,
      include: { memory: { select: { publicId: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(query.limit || 100, 200),
    });
    return rows.map(comment);
  }

  async create(input: CommentInput) {
    const memory = input.memoryId
      ? await this.db.memory.findFirst({
          where: { OR: [{ id: input.memoryId }, { publicId: input.memoryId }] },
          select: { id: true },
        })
      : null;
    if (input.memoryId && !memory) throw new ApiError(404, "Memory not found", "not_found");
    return comment(
      await this.db.comment.create({
        data: {
          memoryId: memory?.id,
          authorName: input.authorName || "Anonymous",
          authorEmail: input.authorEmail,
          content: input.content,
          status: input.status || "PENDING",
          metadata: input.metadata as any,
        },
        include: { memory: { select: { publicId: true, title: true } } },
      }),
    );
  }

  async update(id: string, input: CommentUpdateInput) {
    const existing = await this.db.comment.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Comment not found", "not_found");
    const memory = input.memoryId
      ? await this.db.memory.findFirst({
          where: { OR: [{ id: input.memoryId }, { publicId: input.memoryId }] },
          select: { id: true },
        })
      : null;
    if (input.memoryId && !memory) throw new ApiError(404, "Memory not found", "not_found");
    return comment(
      await this.db.comment.update({
        where: { id },
        data: {
          memoryId: input.memoryId ? memory?.id : undefined,
          authorName: input.authorName,
          authorEmail: input.authorEmail,
          content: input.content,
          status: input.status,
          metadata: input.metadata as any,
        },
        include: { memory: { select: { publicId: true, title: true } } },
      }),
    );
  }

  async archive(id: string) {
    return this.update(id, { status: "ARCHIVED" });
  }
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(): Promise<UserRecord[]> {
    const rows = await this.db.user.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(user);
  }

  async count() {
    return this.db.user.count();
  }

  async findByEmail(email: string) {
    const row = await this.db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } } as any,
    });
    return row ? user(row) : null;
  }

  async findById(id: string) {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? user(row) : null;
  }

  async create(input: UserCreateInput) {
    return user(
      await this.db.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role,
        },
      }),
    );
  }

  async createFirstAdmin(input: UserCreateInput) {
    try {
      return await this.db.$transaction(
        async (transaction) => {
          await transaction.bootstrapClaim.create({
            data: { key: "first-admin" },
          });
          if ((await transaction.user.count()) > 0) {
            throw new ApiError(409, "Admin user already exists", "admin_exists");
          }
          const row = await transaction.user.create({
            data: {
              email: input.email,
              passwordHash: input.passwordHash,
              role: "ADMIN",
            },
          });
          await transaction.bootstrapClaim.update({
            where: { key: "first-admin" },
            data: { userId: row.id },
          });
          return user(row);
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";
      if (code === "P2002" || code === "P2034") {
        throw new ApiError(409, "Admin user already exists", "admin_exists");
      }
      throw error;
    }
  }

  async update(id: string, input: UserUpdateInput) {
    return user(
      await this.db.user.update({
        where: { id },
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          twoFactorSecret: input.twoFactorSecret,
          twoFactorEnabled: input.twoFactorEnabled,
          twoFactorRecoveryCodes: input.twoFactorRecoveryCodes as any,
        },
      }),
    );
  }
}

export class PrismaPageRepository implements PageRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(language = "en") {
    const rows = await this.db.page.findMany({
      where: { language },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    return rows.map(page);
  }

  async get(slug: string, language = "en") {
    const row = await this.db.page.findFirst({ where: { language, slug } });
    return row ? page(row) : null;
  }

  private async save(input: PageInput | PageUpdateInput, slug?: string, language = "en") {
    // Page, mirrored memory and menu targets are one publication operation.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.db.$transaction(async (tx) => {
          if (slug) {
            await tx.$queryRaw`SELECT id FROM pages WHERE slug = ${slug} AND language_code = ${language} FOR UPDATE`;
          }
          const existing = slug ? await tx.page.findUnique({ where: { language_slug: { language, slug } } }) : null;
          if (slug && !existing) throw new ApiError(404, "Page not found", "not_found");
          const values = {
            slug: input.slug, language: input.language, title: input.title,
            excerpt: input.excerpt, bodyMarkdown: input.bodyMarkdown, status: input.status,
            linkedMemoryId: input.linkedMemoryId, metadata: input.metadata as any,
          };
          let saved = existing
            ? await tx.page.update({ where: { id: existing.id }, data: values })
            : await tx.page.create({ data: { ...values, slug: input.slug!, title: input.title! } });
          if (saved.status === "PUBLISHED" && !saved.bodyMarkdown.trim()) {
            throw new ApiError(400, "Write some content before publishing this page.", "empty_page_content");
          }
          const linked = saved.linkedMemoryId ? await tx.memory.findFirst({
            where: { OR: [{ id: saved.linkedMemoryId }, { publicId: saved.linkedMemoryId }, { links: { some: { publicId: saved.linkedMemoryId } } }] },
          }) : null;
          const status = saved.status === "PUBLISHED" ? "NORMAL" : saved.status === "ARCHIVED" ? "ARCHIVED" : "PENDING";
          const metadata = {
            ...(linked?.metadata && typeof linked.metadata === "object" ? linked.metadata : {}),
            ...(saved.metadata && typeof saved.metadata === "object" ? saved.metadata : {}),
            pageSlug: saved.slug, source: "page", isLongForm: true, language: saved.language,
          };
          if (linked) {
            await tx.memory.update({ where: { id: linked.id }, data: {
              title: saved.title, content: saved.bodyMarkdown, excerpt: saved.excerpt || saved.bodyMarkdown.slice(0, 220), status, metadata,
            } });
          } else if (saved.status === "PUBLISHED") {
            const publicId = createPublicMemoryId();
            const mirror = await tx.memory.create({ data: {
              publicId, mapKey: publicId, links: { create: { publicId } },
              title: saved.title, content: saved.bodyMarkdown, excerpt: saved.excerpt || saved.bodyMarkdown.slice(0, 220),
              status, visibility: "PUBLIC", authorName: "Songqi", metadata,
            } });
            saved = await tx.page.update({ where: { id: saved.id }, data: { linkedMemoryId: mirror.publicId } });
          }
          if (existing && existing.slug !== saved.slug) {
            await tx.menuItem.updateMany({ where: { type: "PAGE", language: existing.language, targetValue: existing.slug }, data: { targetValue: saved.slug } });
          }
          await syncMediaReferences(tx, { pageId: saved.id }, saved.bodyMarkdown);
          if (input.navigationVisible !== undefined) {
            const current = await tx.menuItem.findFirst({ where: { language: saved.language, type: "PAGE", targetValue: saved.slug } });
            if (current) await tx.menuItem.update({ where: { id: current.id }, data: { isVisible: input.navigationVisible } });
            else if (input.navigationVisible) {
              const last = await tx.menuItem.aggregate({ where: { language: saved.language }, _max: { position: true } });
              await tx.menuItem.create({ data: { uid: `page-${saved.id}`, language: saved.language, label: saved.title, type: "PAGE", targetValue: saved.slug, position: (last._max.position || 0) + 10, isVisible: true } });
            }
          }
          return page(saved);
        });
      } catch (error: any) {
        if (publicIdConflict(error)) continue;
        if (error.code === "P2002") throw new ApiError(409, "A page already uses this navigation key. Choose another.", "page_slug_taken");
        throw error;
      }
    }
    throw new ApiError(503, "Unable to publish this page. Please try again.", "public_id_unavailable");
  }

  async create(input: PageInput) {
    return this.save(input);
  }

  async update(slug: string, input: PageUpdateInput, language = "en") {
    return this.save(input, slug, language);
  }

  async archive(slug: string, language = "en") {
    return this.update(slug, { status: "ARCHIVED" }, language);
  }
}

export class PrismaMenuItemRepository implements MenuItemRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(language = "en") {
    const rows = await this.db.menuItem.findMany({
      where: { language },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(menuItem);
  }

  async create(input: MenuItemInput) {
    return menuItem(
      await this.db.menuItem.create({
        data: {
          uid: input.uid,
          language: input.language || "en",
          label: input.label,
          type: input.type,
          targetValue: input.targetValue,
          url: input.url,
          position: input.position || 0,
          isVisible: input.isVisible ?? true,
          opensNewTab: input.opensNewTab ?? false,
          metadata: input.metadata as any,
        },
      }),
    );
  }

  async update(id: string, input: MenuItemUpdateInput) {
    const existing = await this.db.menuItem.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Menu item not found", "not_found");
    return menuItem(
      await this.db.menuItem.update({
        where: { id },
        data: {
          uid: input.uid,
          language: input.language,
          label: input.label,
          type: input.type,
          targetValue: input.targetValue,
          url: input.url,
          position: input.position,
          isVisible: input.isVisible,
          opensNewTab: input.opensNewTab,
          metadata: input.metadata as any,
        },
      }),
    );
  }

  async delete(id: string) {
    await this.db.menuItem.delete({ where: { id } }).catch(() => {
      throw new ApiError(404, "Menu item not found", "not_found");
    });
  }
}

export class PrismaSettingRepository implements SettingRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list() {
    const rows = await this.db.appSetting.findMany({ orderBy: { key: "asc" } });
    return rows.map(setting);
  }

  async upsertMany(values: Record<string, unknown>) {
    const rows = await Promise.all(
      Object.entries(values).map(([key, value]) =>
        this.db.appSetting.upsert({
          where: { key },
          update: { value: value as any },
          create: { key, value: value as any },
        }),
      ),
    );
    return rows.map(setting);
  }
}

export class PrismaReadinessRepository implements ReadinessRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async check() {
    await this.db.$queryRaw`SELECT 1`;
  }
}

function assetWhere(query: AssetListQuery = {}) {
  const and: any[] = [];
  if (query.q) and.push({ OR: [
    { url: { contains: query.q, mode: "insensitive" } },
    { metadata: { path: ["filename"], string_contains: query.q, mode: "insensitive" } },
    { references: { some: { OR: [{ memory: { title: { contains: query.q, mode: "insensitive" } } }, { page: { title: { contains: query.q, mode: "insensitive" } } }] } } },
  ] });
  if (query.kind && ["image", "video", "audio"].includes(query.kind)) and.push({ type: { startsWith: query.kind + "/" } });
  if (query.kind === "live") and.push({ metadata: { path: ["livePhoto"], equals: true } });
  if (query.kind === "file") and.push({ NOT: ["image", "video", "audio"].map(kind => ({ type: { startsWith: kind + "/" } })) });
  if (query.unused) and.push({ references: { none: {} } });
  return { deletedAt: null, AND: and };
}
function mediaAsset(row: any): AssetRecord {
  return { id: row.id, identity: row.identity, url: row.url, type: row.type, metadata: row.metadata,
    usageCount: row._count?.references, canDelete: Boolean(mediaStorageKey(row.identity)), createdAt: row.createdAt };
}
export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(limit: number, cursor?: string, query: AssetListQuery = {}) {
    return (await this.db.mediaAsset.findMany({
      where: assetWhere(query) as any, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { _count: { select: { references: true } } }, take: Math.min(limit, 201),
    })).map(mediaAsset);
  }
  async count(query: AssetListQuery = {}) { return this.db.mediaAsset.count({ where: assetWhere(query) as any }); }
  async get(id: string) {
    const row = await this.db.mediaAsset.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { references: true } } } });
    return row ? mediaAsset(row) : null;
  }
  async usage(id: string) {
    const rows = await this.db.mediaReference.findMany({ where: { assetId: id }, include: {
      memory: { select: { publicId: true, title: true, status: true } }, page: { select: { id: true, slug: true, title: true, status: true } },
    } });
    return rows.map(row => row.page
      ? { kind: "page" as const, ...row.page }
      : { kind: "memory" as const, id: row.memory!.publicId, title: row.memory!.title, status: row.memory!.status });
  }
  async create(input: AssetCreateInput) {
    return this.db.$transaction(async tx => {
      const asset = await registerMedia(tx, input);
      if (input.memoryId) {
        const owner = await tx.memory.findFirst({ where: { OR: [{ id: input.memoryId }, { publicId: input.memoryId }] } });
        if (!owner) throw new ApiError(404, "Memory not found", "not_found");
        if (await tx.page.findFirst({ where: { linkedMemoryId: owner.publicId } })) throw new ApiError(409, "Upload media in the Page editor.", "page_managed_memory");
        await tx.attachment.create({ data: { memoryId: owner.id, url: input.url, type: input.type, metadata: input.metadata as any } });
        await tx.mediaReference.upsert({ where: { assetId_memoryId: { assetId: asset.id, memoryId: owner.id } }, create: { assetId: asset.id, memoryId: owner.id }, update: {} });
      }
      return { ...mediaAsset(asset), memoryId: input.memoryId };
    });
  }
  async deleteUnused(id: string, remove: (asset: AssetRecord) => Promise<void>) {
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM media_assets WHERE id = ${id} FOR UPDATE`;
      const row = await tx.mediaAsset.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new ApiError(404, "File not found", "not_found");
      if (await tx.mediaReference.count({ where: { assetId: id } })) throw new ApiError(409, "This file is still used. Remove all memory and page references before deleting it.", "asset_in_use");
      await remove(mediaAsset(row));
      await tx.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    }, { timeout: 15000 });
  }
}
