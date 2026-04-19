// ============================================================
// Wamanafo SHS — Prisma Client Singleton
// Prevents multiple instances during hot-reload in development.
// Gracefully handles uninitialized state during `next build`.
// ============================================================

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const datasourceUrl = resolveDatasourceUrl();

  return new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function resolveDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw);

    // Hosted Postgres providers typically require TLS; enforce it when absent.
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }

    // Keep connection failures fast/fail-safe in production-style environments.
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", process.env.DB_CONNECT_TIMEOUT ?? "15");
    }

    // Dev-only escape hatch for Windows TLS credential-store issues.
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.DB_SSL_ACCEPT_INVALID === "true" &&
      !url.searchParams.has("sslaccept")
    ) {
      url.searchParams.set("sslaccept", "accept_invalid_certs");
    }

    return url.toString();
  } catch {
    // If URL parsing fails, allow Prisma to surface its own validation error.
    return raw;
  }
}

export const db: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
