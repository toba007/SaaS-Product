import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

// dev の hot reload で接続が増え続けないように使い回す
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
