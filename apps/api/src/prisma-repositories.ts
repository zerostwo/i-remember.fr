import { getPrismaClient } from "@i-remember/database";
import type {
  AttachmentInput,
  AssetRecord,
  MemoryInput,
  MemoryRecord,
  MemoryUpdateInput,
  UserRecord,
} from "./domain.js";
import { ApiError } from "./errors.js";
import type {
  AssetRepository,
  MemoryListQuery,
  MemoryRepository,
  UserRepository,
} from "./repositories.js";

const memoryInclude = {
  attachments: { orderBy: { createdAt: "asc" } },
  tags: { include: { tag: true }, orderBy: { createdAt: "asc" } },
} as const;

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

function memoryWhere(query: MemoryListQuery) {
  const q = query.q?.trim();
  return {
    ...(query.status === "all" ? {} : { status: query.status || "NORMAL" }),
    ...(query.visibility === "all" ? {} : { visibility: query.visibility || "PUBLIC" }),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
            { excerpt: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
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
          title: input.title,
          content: input.content,
          excerpt: input.content.slice(0, 220),
          authorName: input.authorName || "Anonymous",
          visibility: input.visibility || "PUBLIC",
          status: "PENDING",
          latitude: input.latitude,
          longitude: input.longitude,
          emotion: input.emotion,
          metadata: input.metadata as any,
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
      content: input.content,
      excerpt: input.content ? input.content.slice(0, 220) : undefined,
      authorName: input.authorName,
      visibility: input.visibility,
      latitude: input.latitude,
      longitude: input.longitude,
      emotion: input.emotion,
      status: input.status,
      metadata: input.metadata as any,
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

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(): Promise<UserRecord[]> {
    return this.db.user.findMany({ orderBy: { createdAt: "desc" } });
  }

  async count() {
    return this.db.user.count();
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
}
