import { randomBytes } from "node:crypto";
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
  UserRecord,
} from "./domain.js";
import { ApiError } from "./errors.js";
import type {
  AssetRepository,
  CommentListQuery,
  CommentRepository,
  MenuItemRepository,
  MemoryListQuery,
  MemoryRepository,
  PageRepository,
  SettingRepository,
  UserRepository,
} from "./repositories.js";

const memoryInclude = {
  attachments: { orderBy: { createdAt: "asc" } },
  tags: { include: { tag: true }, orderBy: { createdAt: "asc" } },
} as const;

export function createPublicMemoryId() {
  return `m${randomBytes(10).toString("hex")}`;
}

function tagSlug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "tag"
  );
}

function tagCreates(tags: string[] = []) {
  const unique = new Map(tags.map((name) => [tagSlug(name), name]));
  return [...unique].map(([slug, name]) => ({
    tag: {
      connectOrCreate: {
        where: { slug },
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

function memory(row: any): MemoryRecord {
  return {
    id: row.id,
    publicId: row.publicId,
    legacyId: row.legacyId,
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
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    createdAt: row.createdAt,
  };
}

function memoryWhere(query: MemoryListQuery) {
  const q = query.q?.trim();
  return {
    ...(query.status === "all" ? {} : { status: query.status || "NORMAL" }),
    ...(query.visibility === "all" ? {} : { visibility: query.visibility || "PUBLIC" }),
    ...(query.legacyId === undefined ? {} : { legacyId: query.legacyId }),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
            { excerpt: { contains: q, mode: "insensitive" } },
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

  async list(query: MemoryListQuery) {
    const rows = await this.db.memory.findMany({
      where: memoryWhere(query) as any,
      include: memoryInclude,
      orderBy: { createdAt: "desc" },
      take: Math.min(query.limit || 100, 200),
    });
    return rows.map(memory);
  }

  async count(query: MemoryListQuery) {
    return this.db.memory.count({ where: memoryWhere(query) as any });
  }

  async get(id: string) {
    const row = await this.db.memory.findFirst({
      where: {
        OR: [{ id }, { publicId: id }],
        status: { not: "ARCHIVED" },
      },
      include: memoryInclude,
    });
    return row ? memory(row) : null;
  }

  async create(input: MemoryInput) {
    return memory(
      await this.db.memory.create({
        data: {
          publicId: createPublicMemoryId(),
          title: input.title,
          legacyId: input.legacyId,
          content: input.content,
          excerpt: input.content.slice(0, 220),
          authorId: input.authorId,
          authorName: input.authorName || "Anonymous",
          visibility: input.visibility || "PUBLIC",
          status: "PENDING",
          latitude: input.latitude,
          longitude: input.longitude,
          emotion: input.emotion,
          metadata: input.metadata as any,
          embedding: input.embedding as any,
          aiSummary: input.aiSummary,
          knowledgeGraph: input.knowledgeGraph as any,
          attachments: input.attachments?.length
            ? { create: attachmentCreates(input.attachments) }
            : undefined,
          tags: input.tags?.length ? { create: tagCreates(input.tags) } : undefined,
        },
        include: memoryInclude,
      }),
    );
  }

  async update(id: string, input: MemoryUpdateInput) {
    const existing = await this.get(id);
    if (!existing) throw new ApiError(404, "Memory not found", "not_found");
    const data: any = {
      title: input.title,
      legacyId: input.legacyId,
      content: input.content,
      excerpt: input.content ? input.content.slice(0, 220) : undefined,
      authorId: input.authorId,
      authorName: input.authorName,
      visibility: input.visibility,
      latitude: input.latitude,
      longitude: input.longitude,
      emotion: input.emotion,
      status: input.status,
      metadata: input.metadata as any,
      embedding: input.embedding as any,
      aiSummary: input.aiSummary,
      knowledgeGraph: input.knowledgeGraph as any,
    };
    if (input.attachments) {
      data.attachments = { deleteMany: {}, create: attachmentCreates(input.attachments) };
    }
    if (input.tags) {
      data.tags = { deleteMany: {}, create: tagCreates(input.tags) };
    }
    return memory(
      await this.db.memory.update({
        where: { id: existing.id },
        data,
        include: memoryInclude,
      }),
    );
  }

  async archive(id: string) {
    const existing = await this.get(id);
    if (!existing) throw new ApiError(404, "Memory not found", "not_found");
    return memory(
      await this.db.memory.update({
        where: { id: existing.id },
        data: { status: "ARCHIVED" },
        include: memoryInclude,
      }),
    );
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

  async create(input: PageInput) {
    return page(
      await this.db.page.create({
        data: {
          slug: input.slug,
          language: input.language || "en",
          title: input.title,
          excerpt: input.excerpt,
          bodyMarkdown: input.bodyMarkdown || "",
          status: input.status || "DRAFT",
          linkedMemoryId: input.linkedMemoryId,
          metadata: input.metadata as any,
        },
      }),
    );
  }

  async update(slug: string, input: PageUpdateInput, language = "en") {
    const existing = await this.get(slug, language);
    if (!existing) throw new ApiError(404, "Page not found", "not_found");
    return page(
      await this.db.page.update({
        where: { id: existing.id },
        data: {
          slug: input.slug,
          language: input.language,
          title: input.title,
          excerpt: input.excerpt,
          bodyMarkdown: input.bodyMarkdown,
          status: input.status,
          linkedMemoryId: input.linkedMemoryId,
          metadata: input.metadata as any,
        },
      }),
    );
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

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(limit: number): Promise<AssetRecord[]> {
    const rows = await this.db.attachment.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
    });
    return rows.map((row: any) => ({
      id: row.id,
      memoryId: row.memoryId,
      url: row.url,
      type: row.type,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : null,
      createdAt: row.createdAt,
    }));
  }

  async create(input: AssetCreateInput): Promise<AssetRecord> {
    const memory = await this.db.memory.findFirst({
      where: { OR: [{ id: input.memoryId }, { publicId: input.memoryId }] },
      select: { id: true },
    });
    if (!memory) throw new ApiError(404, "Memory not found", "not_found");
    const row = await this.db.attachment.create({
      data: {
        memoryId: memory.id,
        url: input.url,
        type: input.type,
        metadata: input.metadata as any,
      },
    });
    return {
      id: row.id,
      memoryId: row.memoryId,
      url: row.url,
      type: row.type,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
      createdAt: row.createdAt,
    };
  }

  async deleteByUrl(url: string) {
    await this.db.attachment.deleteMany({ where: { url } });
  }
}
