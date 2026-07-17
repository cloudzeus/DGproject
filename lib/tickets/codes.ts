import { prisma } from "@/lib/prisma";

/**
 * Next sequential ticket code: TKT-YYYY-NNNN (resets each year).
 * Concurrent callers may race — the caller must retry on the unique
 * constraint violation of Ticket.code (Prisma error P2002).
 */
export async function nextTicketCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TKT-${year}-`;
  const last = await prisma.ticket.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const n = last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}
