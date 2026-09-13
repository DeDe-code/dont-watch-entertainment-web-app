/**
 * server/utils/prisma.ts
 *
 * Prisma client singleton for use across all server-side API routes and middleware.
 *
 * A new PrismaClient is instantiated on first import. In development, the instance
 * is cached on `globalThis` to survive hot-module replacement (HMR) reloads and
 * prevent exhausting the SQLite connection pool. In production a fresh client is
 * created once per process — no caching needed.
 */
import { PrismaClient } from '@prisma/client'

// Extend the Node.js global type so TypeScript accepts the prisma property
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Reuse the existing client if one is already attached to the global (HMR-safe)
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// Persist the client on globalThis only in development to survive HMR reloads;
// in production this block is skipped and the module-level instance is sufficient
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
