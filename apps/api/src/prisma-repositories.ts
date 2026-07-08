import { getPrismaClient } from "@i-remember/database";
import type { AssetRecord, MemoryInput, MemoryRecord, UserRecord } from "./domain.js";
import { ApiError } from "./errors.js";
import type {
  AssetRepository,
  MemoryListQuery,
  MemoryRepository,
  UserRepository,
} from "./repositories.js";

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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaMemoryRepository implements MemoryRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(query: MemoryListQuery) {
    const q = query.q?.trim();
    const rows = await this.db.memory.findMany({
      where: {
        status: "NORMAL",
        visibility: "PUBLIC",
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { content: { contains: q, mode: "insensitive" } },
                { excerpt: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(query.limit || 100, 200),
    });
    return rows.map(memory);
  }

  async get(id: string) {
    const row = await this.db.memory.findFirst({
      where: {
        OR: [{ id }, { publicId: id }],
        status: { not: "ARCHIVED" },
      },
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
        },
      }),
    );
  }

  async update(id: string, input: Partial<MemoryInput>) {
    const existing = await this.get(id);
    if (!existing) throw new ApiError(404, "Memory not found", "not_found");
    return memory(
      await this.db.memory.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          content: input.content,
          excerpt: input.content ? input.content.slice(0, 220) : undefined,
          authorName: input.authorName,
          visibility: input.visibility,
          latitude: input.latitude,
          longitude: input.longitude,
          emotion: input.emotion,
          metadata: input.metadata as any,
        },
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
      }),
    );
  }
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db = getPrismaClient()) {}

  async list(): Promise<UserRecord[]> {
    return this.db.user.findMany({ orderBy: { createdAt: "desc" } });
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
