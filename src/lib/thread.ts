import prisma from "@/lib/database/prisma";

/**
 * Ensure a thread exists; create if missing. Title derived from seed (first 100 chars) or fallback.
 * Returns the Prisma thread record.
 */
export async function ensureThread(threadId: string, titleSeed?: string) {
  if (!threadId) throw new Error("threadId is required");
  const existing = await prisma.thread.findUnique({ where: { id: threadId } });
  if (existing) return existing;
  const title = (titleSeed?.trim() || "New thread").substring(0, 100);
  return prisma.thread.create({ data: { id: threadId, title } });
}
