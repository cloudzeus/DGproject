import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/tickets/slug'

/**
 * Επιστρέφει helpCategoryId: υπάρχον id ή δημιουργία/επανάχρηση από όνομα.
 * Ποτέ αυτόνομα από AI — μόνο σε approve. Καλείται ΜΟΝΟ server-side από
 * ελεγμένα (auth'd) server actions — σκόπιμα ΕΚΤΟΣ 'use server' αρχείου
 * ώστε να μην εκτίθεται ως αυτόνομο server-action endpoint.
 */
export async function resolveHelpCategory(input: { categoryId?: string | null; newName?: string | null }): Promise<string | null> {
  if (input.categoryId) {
    const existing = await prisma.helpCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } })
    if (existing) return existing.id
  }
  const name = input.newName?.trim().slice(0, 80)
  if (!name) return null
  const byName = await prisma.helpCategory.findUnique({ where: { name }, select: { id: true } })
  if (byName) return byName.id
  let slug = slugify(name)
  if (await prisma.helpCategory.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${Date.now().toString(36)}`
  try {
    const created = await prisma.helpCategory.create({ data: { name, slug }, select: { id: true } })
    return created.id
  } catch (e) {
    // P2002: concurrent create with the same name won the race — reuse it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const winner = await prisma.helpCategory.findUnique({ where: { name }, select: { id: true } })
      if (winner) return winner.id
    }
    throw e
  }
}
