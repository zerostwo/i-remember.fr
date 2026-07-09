import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientInstance } from "@prisma/client";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientInstance;
};

export function createPrismaClient(): PrismaClientInstance {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://i_remember:i_remember@localhost:5432/i_remember?schema=public",
  });
  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClientInstance {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}
