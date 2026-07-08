import { authenticate, login } from "./auth.js";
import type { MemoryRecord } from "./domain.js";
import { ApiError } from "./errors.js";
import { readJson, type RequestContext } from "./http.js";
import {
  AgentService,
  AssetService,
  DashboardService,
  MemoryService,
  UserService,
} from "./services.js";
import {
  agentQueryInput,
  assetUploadInput,
  memoryInput,
  memoryListQuery,
  memoryPatchInput,
} from "./validation.js";

function memoryDto(memory: MemoryRecord) {
  return {
    id: memory.publicId,
    legacyId: memory.legacyId,
    title: memory.title,
    content: memory.content,
    excerpt: memory.excerpt,
    authorId: memory.authorId,
    authorName: memory.authorName,
    visibility: memory.visibility,
    status: memory.status,
    latitude: memory.latitude,
    longitude: memory.longitude,
    emotion: memory.emotion,
    metadata: memory.metadata || {},
    attachments: (memory.attachments || []).map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      type: attachment.type,
      metadata: attachment.metadata || {},
      createdAt: attachment.createdAt.toISOString(),
    })),
    tags: (memory.tags || []).map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    })),
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

export class MemoryController {
  constructor(private readonly memories: MemoryService) {}

  async list(context: RequestContext) {
    const data = await this.memories.list(
      authenticate(context.req),
      memoryListQuery(context.url.searchParams),
    );
    return { success: true, data: data.map(memoryDto) };
  }

  async get(context: RequestContext) {
    const data = await this.memories.get(authenticate(context.req), context.params.id);
    if (!data) throw new ApiError(404, "Memory not found", "not_found");
    return { success: true, data: memoryDto(data) };
  }

  async create(context: RequestContext) {
    const data = await this.memories.create(memoryInput(await readJson(context.req)));
    context.res.statusCode = 201;
    return { success: true, data: memoryDto(data) };
  }

  async update(context: RequestContext) {
    const data = await this.memories.update(
      authenticate(context.req),
      context.params.id,
      memoryPatchInput(await readJson(context.req)),
    );
    return { success: true, data: memoryDto(data) };
  }

  async archive(context: RequestContext) {
    const data = await this.memories.archive(authenticate(context.req), context.params.id);
    return { success: true, data: memoryDto(data) };
  }
}

export class SearchController {
  constructor(private readonly memories: MemoryService) {}

  async search(context: RequestContext) {
    const data = await this.memories.list(
      authenticate(context.req),
      memoryListQuery(context.url.searchParams),
    );
    return { success: true, data: data.map(memoryDto) };
  }
}

export class AgentController {
  constructor(private readonly agent: AgentService) {}

  async answer(context: RequestContext) {
    const data = await this.agent.answer(
      authenticate(context.req),
      agentQueryInput(await readJson(context.req)),
    );
    return { success: true, data };
  }
}

export class UserController {
  constructor(private readonly users: UserService) {}

  async list(context: RequestContext) {
    const data = await this.users.list(authenticate(context.req));
    return { success: true, data };
  }
}

export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  async summary(context: RequestContext) {
    const data = await this.dashboard.summary(authenticate(context.req));
    return { success: true, data };
  }
}

export class AssetController {
  constructor(private readonly assets: AssetService) {}

  async list(context: RequestContext) {
    const limit = Number(context.url.searchParams.get("limit") || 80);
    const data = await this.assets.list(authenticate(context.req), limit);
    return { success: true, data };
  }

  async upload(context: RequestContext) {
    const data = await this.assets.upload(
      authenticate(context.req),
      assetUploadInput(await readJson(context.req)),
    );
    context.res.statusCode = 201;
    return { success: true, data };
  }

  async getUrl(context: RequestContext) {
    const data = this.assets.getUrl(authenticate(context.req), context.params.key);
    return { success: true, data };
  }

  async delete(context: RequestContext) {
    const data = await this.assets.delete(authenticate(context.req), context.params.key);
    return { success: true, data };
  }
}

export class AuthController {
  async login(context: RequestContext) {
    return { success: true, data: login(await readJson(context.req)) };
  }
}
