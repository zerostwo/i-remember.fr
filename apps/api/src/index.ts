import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AgentController,
  AuthController,
  AssetController,
  CommentController,
  DashboardController,
  MenuItemController,
  MemoryController,
  PageController,
  SearchController,
  SettingController,
  UserController,
} from "./controllers.js";
import { handleErrors, Router } from "./http.js";
import {
  PrismaAssetRepository,
  PrismaCommentRepository,
  PrismaMenuItemRepository,
  PrismaMemoryRepository,
  PrismaPageRepository,
  PrismaSettingRepository,
  PrismaUserRepository,
} from "./prisma-repositories.js";
import type {
  AssetRepository,
  CommentRepository,
  MenuItemRepository,
  MemoryRepository,
  PageRepository,
  SettingRepository,
  UserRepository,
} from "./repositories.js";
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
import type { StorageAdapter } from "@i-remember/storage";

export type ApiDependencies = {
  memories?: MemoryRepository;
  users?: UserRepository;
  assets?: AssetRepository;
  comments?: CommentRepository;
  pages?: PageRepository;
  menuItems?: MenuItemRepository;
  settings?: SettingRepository;
  storage?: StorageAdapter;
};

export function createApiV1Router(dependencies: ApiDependencies = {}) {
  const memoryRepository = dependencies.memories || new PrismaMemoryRepository();
  const userRepository = dependencies.users || new PrismaUserRepository();
  const assetRepository = dependencies.assets || new PrismaAssetRepository();
  const commentRepository = dependencies.comments || new PrismaCommentRepository();
  const pageRepository = dependencies.pages || new PrismaPageRepository();
  const menuItemRepository = dependencies.menuItems || new PrismaMenuItemRepository();
  const settingRepository = dependencies.settings || new PrismaSettingRepository();
  const memoryService = new MemoryService(memoryRepository);
  const userService = new UserService(userRepository);
  const assetService = new AssetService(assetRepository, dependencies.storage);
  const commentService = new CommentService(commentRepository);
  const pageService = new PageService(pageRepository);
  const menuItemService = new MenuItemService(menuItemRepository);
  const settingService = new SettingService(settingRepository);
  const dashboardService = new DashboardService(memoryRepository, userRepository);
  const agentService = new AgentService(memoryService);
  const authService = new AuthService(userRepository);
  const memories = new MemoryController(memoryService);
  const dashboard = new DashboardController(dashboardService);
  const search = new SearchController(memoryService);
  const agent = new AgentController(agentService);
  const users = new UserController(userService);
  const assets = new AssetController(assetService);
  const comments = new CommentController(commentService);
  const pages = new PageController(pageService);
  const menuItems = new MenuItemController(menuItemService);
  const settings = new SettingController(settingService);
  const auth = new AuthController(authService);
  const router = new Router();

  router.add("GET", "/api/v1/memories", (context) => memories.list(context));
  router.add("POST", "/api/v1/memories", (context) => memories.create(context));
  router.add("GET", "/api/v1/memories/:id", (context) => memories.get(context));
  router.add("PATCH", "/api/v1/memories/:id", (context) => memories.update(context));
  router.add("DELETE", "/api/v1/memories/:id", (context) => memories.archive(context));
  router.add("GET", "/api/v1/search", (context) => search.search(context));
  router.add("POST", "/api/v1/agent", (context) => agent.answer(context));
  router.add("GET", "/api/v1/dashboard", (context) => dashboard.summary(context));
  router.add("GET", "/api/v1/users", (context) => users.list(context));
  router.add("GET", "/api/v1/comments", (context) => comments.list(context));
  router.add("POST", "/api/v1/comments", (context) => comments.create(context));
  router.add("PATCH", "/api/v1/comments/:id", (context) => comments.update(context));
  router.add("DELETE", "/api/v1/comments/:id", (context) => comments.archive(context));
  router.add("GET", "/api/v1/pages", (context) => pages.list(context));
  router.add("POST", "/api/v1/pages", (context) => pages.create(context));
  router.add("GET", "/api/v1/pages/:slug", (context) => pages.get(context));
  router.add("PATCH", "/api/v1/pages/:slug", (context) => pages.update(context));
  router.add("DELETE", "/api/v1/pages/:slug", (context) => pages.archive(context));
  router.add("GET", "/api/v1/menu-items", (context) => menuItems.list(context));
  router.add("POST", "/api/v1/menu-items", (context) => menuItems.create(context));
  router.add("PATCH", "/api/v1/menu-items/:id", (context) => menuItems.update(context));
  router.add("DELETE", "/api/v1/menu-items/:id", (context) => menuItems.delete(context));
  router.add("GET", "/api/v1/settings", (context) => settings.list(context));
  router.add("PUT", "/api/v1/settings", (context) => settings.update(context));
  router.add("GET", "/api/v1/assets", (context) => assets.list(context));
  router.add("POST", "/api/v1/assets", (context) => assets.upload(context));
  router.add("GET", "/api/v1/assets/:key*", (context) => assets.getUrl(context));
  router.add("DELETE", "/api/v1/assets/:key*", (context) => assets.delete(context));
  router.add("POST", "/api/v1/auth/login", (context) => auth.login(context));

  return router;
}

export function createApiV1Middleware(dependencies: ApiDependencies = {}) {
  const router = createApiV1Router(dependencies);

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    handleErrors(res, () => router.handle(req, res)).then((handled) => {
      if (!handled) next();
    });
  };
}
