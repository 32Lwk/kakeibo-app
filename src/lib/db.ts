import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** pg が sslmode=require を verify-full の別名として扱う際の警告を避ける（Neon 等） */
function normalizePgConnectionString(url: string): string {
  if (/\buselibpqcompat=/.test(url)) return url;
  if (!/\bsslmode=require\b/.test(url)) return url;
  return url.replace(/\bsslmode=require\b/g, "sslmode=verify-full");
}

export const prisma =
  globalForPrisma.prisma ??
  (() => {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error("DATABASE_URL is required");
    const connectionString = normalizePgConnectionString(raw);
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  })();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

