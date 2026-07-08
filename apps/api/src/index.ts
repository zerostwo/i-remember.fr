import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AgentController,
  AuthController,
  AssetController,
  DashboardController,
  MemoryController,
  SearchController,
  UserController,
} from "./controllers.js";
import { handleErrors, Router } from "./http.js";
import {
  PrismaAssetRepository,
  PrismaMemoryRepository,
  PrismaUserRepository,
} from "./prisma-repositories.js";
import type { AssetRepository, MemoryRepository, UserRepository } from "./repositories.js";
import {
  AgentService,
  AssetService,
  DashboardService,
  MemoryService,
  UserService,
} from "./services.js";
import type { StorageAdapter } from "@i-remember/storage";

export type ApiDependencies = {
  memories?: MemoryRepository;
  users?: UserRepository;
  assets?: AssetRepository;
  storage?: StorageAdapter;
};

export function createApiV1Router(dependencies: ApiDependencies = {}) {
  const memoryRepository = dependencies.memories || new PrismaMemoryRepository();
  const userRepository = dependencies.users || new PrismaUserRepository();
  const assetRepository = dependencies.assets || new PrismaAssetRepository();
  const memoryService = new MemoryService(memoryRepository);
  const userService = new UserService(userRepository);
  const assetService = new AssetService(assetRepository, dependencies.storage);
  const dashboardService = new DashboardService(memoryRepository, userRepository);
  const agentService = new AgentService(memoryService);
  const memories = new MemoryController(memoryService);
  const dashboard = new DashboardController(dashboardService);
  const search = new SearchController(memoryService);
  const agent = new AgentController(agentService);
  const users = new UserController(userService);
  const assets = new AssetController(assetService);
  const auth = new AuthController();
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
  router.add("GET", "/api/v1/assets", (context) => assets.list(context));
  router.add("POST", "/api/v1/assets", (context) => assets.upload(context));
  router.add("GET", "/api/v1/assets/:key", (context) => assets.getUrl(context));
  router.add("DELETE", "/api/v1/assets/:key", (context) => assets.delete(context));
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
