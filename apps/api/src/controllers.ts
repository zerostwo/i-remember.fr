import { authenticate, requireRole } from "./auth.js";
import type {
  CommentRecord,
  MenuItemRecord,
  MemoryRecord,
  PageRecord,
  SettingRecord,
  UserRecord,
} from "./domain.js";
import { ApiError } from "./errors.js";
import { readJson, type RequestContext } from "./http.js";
import {
  AgentService,
  AssetService,
  AuthService,
  CommentService,
  DashboardService,
  MenuItemService,
  MemoryService,
  PageService,
  SettingService,
  UserService,
} from "./services.js";
import {
  agentQueryInput,
  assetKeyInput,
  assetUploadInput,
  commentInput,
  commentListQuery,
  commentPatchInput,
  languageQuery,
  menuItemInput,
  menuItemPatchInput,
  memoryInput,
  memoryListQuery,
  memoryPatchInput,
  pageInput,
  pagePatchInput,
  pageSlugInput,
  settingsInput,
} from "./validation.js";

function memoryDto(memory: MemoryRecord, includePrivate = false) {
  const dto = {
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
  if (!includePrivate) return dto;
  return {
    ...dto,
    embedding: memory.embedding || null,
    aiSummary: memory.aiSummary || null,
    knowledgeGraph: memory.knowledgeGraph || null,
  };
}

function pageDto(page: PageRecord) {
  return {
    id: page.id,
    slug: page.slug,
    language: page.language,
    title: page.title,
    excerpt: page.excerpt,
    bodyMarkdown: page.bodyMarkdown,
    status: page.status,
    linkedMemoryId: page.linkedMemoryId,
    metadata: page.metadata || {},
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

function menuItemDto(item: MenuItemRecord) {
  return {
    id: item.id,
    uid: item.uid,
    language: item.language,
    label: item.label,
    type: item.type,
    targetValue: item.targetValue,
    url: item.url,
    position: item.position,
    isVisible: item.isVisible,
    opensNewTab: item.opensNewTab,
    metadata: item.metadata || {},
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function commentDto(comment: CommentRecord) {
  return {
    id: comment.id,
    memoryId: comment.memoryPublicId || comment.memoryId,
    memoryTitle: comment.memoryTitle,
    authorName: comment.authorName,
    authorEmail: comment.authorEmail,
    content: comment.content,
    status: comment.status,
    metadata: comment.metadata || {},
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

function settingsDto(settings: SettingRecord[]) {
  return Object.fromEntries(settings.map((item) => [item.key, item.value]));
}

function userDto(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function assetListLimit(searchParams: URLSearchParams) {
  const limit = Number(searchParams.get("limit") || 80);
  if (!Number.isFinite(limit) || limit < 1) {
    throw new ApiError(400, "Invalid asset limit", "invalid_asset_limit");
  }
  return Math.min(Math.floor(limit), 200);
}

export class MemoryController {
  constructor(private readonly memories: MemoryService) {}

  async list(context: RequestContext) {
    const principal = authenticate(context.req);
    const data = await this.memories.list(principal, memoryListQuery(context.url.searchParams));
    return {
      success: true,
      data: data.map((memory) => memoryDto(memory, principal.role === "ADMIN")),
    };
  }

  async get(context: RequestContext) {
    const principal = authenticate(context.req);
    const data = await this.memories.get(principal, context.params.id);
    if (!data) throw new ApiError(404, "Memory not found", "not_found");
    return { success: true, data: memoryDto(data, principal.role === "ADMIN") };
  }

  async create(context: RequestContext) {
    const input = memoryInput(await readJson(context.req));
    const hasAiFields =
      input.embedding !== undefined ||
      input.aiSummary !== undefined ||
      input.knowledgeGraph !== undefined;
    let includePrivate = false;
    if (input.authorId || input.legacyId !== undefined || hasAiFields) {
      const principal = authenticate(context.req);
      includePrivate = principal.role === "ADMIN";
      if (input.legacyId !== undefined) {
        requireRole(principal, ["ADMIN"]);
      }
      if (hasAiFields) {
        requireRole(principal, ["ADMIN"]);
      }
      if (input.authorId) {
        requireRole(principal, ["ADMIN", "USER"]);
        if (principal.role !== "ADMIN" && principal.id !== input.authorId) {
          throw new ApiError(403, "Permission denied", "forbidden");
        }
      }
    }
    const data = await this.memories.create(input);
    context.res.statusCode = 201;
    return { success: true, data: memoryDto(data, includePrivate) };
  }

  async update(context: RequestContext) {
    const data = await this.memories.update(
      authenticate(context.req),
      context.params.id,
      memoryPatchInput(await readJson(context.req)),
    );
    return { success: true, data: memoryDto(data, true) };
  }

  async archive(context: RequestContext) {
    const data = await this.memories.archive(authenticate(context.req), context.params.id);
    return { success: true, data: memoryDto(data, true) };
  }
}

export class SearchController {
  constructor(private readonly memories: MemoryService) {}

  async search(context: RequestContext) {
    const data = await this.memories.list(
      authenticate(context.req),
      memoryListQuery(context.url.searchParams),
    );
    return { success: true, data: data.map((memory) => memoryDto(memory)) };
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
    return { success: true, data: data.map(userDto) };
  }
}

export class PageController {
  constructor(private readonly pages: PageService) {}

  async list(context: RequestContext) {
    const data = await this.pages.list(
      authenticate(context.req),
      languageQuery(context.url.searchParams),
    );
    return { success: true, data: data.map(pageDto) };
  }

  async get(context: RequestContext) {
    const data = await this.pages.get(
      authenticate(context.req),
      pageSlugInput(context.params.slug),
      languageQuery(context.url.searchParams),
    );
    if (!data) throw new ApiError(404, "Page not found", "not_found");
    return { success: true, data: pageDto(data) };
  }

  async create(context: RequestContext) {
    const data = await this.pages.create(
      authenticate(context.req),
      pageInput(await readJson(context.req)),
    );
    context.res.statusCode = 201;
    return { success: true, data: pageDto(data) };
  }

  async update(context: RequestContext) {
    const data = await this.pages.update(
      authenticate(context.req),
      pageSlugInput(context.params.slug),
      pagePatchInput(await readJson(context.req)),
      languageQuery(context.url.searchParams),
    );
    return { success: true, data: pageDto(data) };
  }

  async archive(context: RequestContext) {
    const data = await this.pages.archive(
      authenticate(context.req),
      pageSlugInput(context.params.slug),
      languageQuery(context.url.searchParams),
    );
    return { success: true, data: pageDto(data) };
  }
}

export class MenuItemController {
  constructor(private readonly menuItems: MenuItemService) {}

  async list(context: RequestContext) {
    const data = await this.menuItems.list(
      authenticate(context.req),
      languageQuery(context.url.searchParams),
    );
    return { success: true, data: data.map(menuItemDto) };
  }

  async create(context: RequestContext) {
    const data = await this.menuItems.create(
      authenticate(context.req),
      menuItemInput(await readJson(context.req)),
    );
    context.res.statusCode = 201;
    return { success: true, data: menuItemDto(data) };
  }

  async update(context: RequestContext) {
    const data = await this.menuItems.update(
      authenticate(context.req),
      context.params.id,
      menuItemPatchInput(await readJson(context.req)),
    );
    return { success: true, data: menuItemDto(data) };
  }

  async delete(context: RequestContext) {
    const data = await this.menuItems.delete(authenticate(context.req), context.params.id);
    return { success: true, data };
  }
}

export class SettingController {
  constructor(private readonly settings: SettingService) {}

  async list(context: RequestContext) {
    const data = await this.settings.list(authenticate(context.req));
    return { success: true, data: settingsDto(data) };
  }

  async update(context: RequestContext) {
    const data = await this.settings.upsertMany(
      authenticate(context.req),
      settingsInput(await readJson(context.req)),
    );
    return { success: true, data: settingsDto(data) };
  }
}

export class CommentController {
  constructor(private readonly comments: CommentService) {}

  async list(context: RequestContext) {
    const data = await this.comments.list(
      authenticate(context.req),
      commentListQuery(context.url.searchParams),
    );
    return { success: true, data: data.map(commentDto) };
  }

  async create(context: RequestContext) {
    const data = await this.comments.create(
      authenticate(context.req),
      commentInput(await readJson(context.req)),
    );
    context.res.statusCode = 201;
    return { success: true, data: commentDto(data) };
  }

  async update(context: RequestContext) {
    const data = await this.comments.update(
      authenticate(context.req),
      context.params.id,
      commentPatchInput(await readJson(context.req)),
    );
    return { success: true, data: commentDto(data) };
  }

  async archive(context: RequestContext) {
    const data = await this.comments.archive(authenticate(context.req), context.params.id);
    return { success: true, data: commentDto(data) };
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
    const principal = authenticate(context.req);
    const limit = assetListLimit(context.url.searchParams);
    const data = await this.assets.list(principal, limit);
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
    const data = this.assets.getUrl(authenticate(context.req), assetKeyInput(context.params.key));
    return { success: true, data };
  }

  async delete(context: RequestContext) {
    const data = await this.assets.delete(
      authenticate(context.req),
      assetKeyInput(context.params.key),
    );
    return { success: true, data };
  }
}

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  async login(context: RequestContext) {
    return { success: true, data: await this.auth.login(await readJson(context.req)) };
  }
}
