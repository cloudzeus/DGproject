// app/(app)/knowledge/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/tickets/slug'
import type { TicketCategory } from '@prisma/client'

// KB authoring is a triager surface (admin/manager) — same rule as ticket triage.
async function requireTriager(): Promise<string> {
  const session = await auth()
  const role = session?.user?.role
  if (!session?.user?.id || (role !== 'admin' && role !== 'manager')) {
    throw new Error('Δεν έχετε δικαίωμα διαχείρισης της γνωσιακής βάσης.')
  }
  return session.user.id
}

type EntryInput = {
  title: string
  problem: string
  solution: string
  tags: string[]
  category: TicketCategory | null
  projectId: string | null
  sourceId: string | null
  isPublic: boolean
}

function validate(input: EntryInput): string | null {
  if (!input.title.trim()) return 'Ο τίτλος είναι υποχρεωτικός.'
  if (!input.solution.trim()) return 'Η λύση είναι υποχρεωτική.'
  if (input.isPublic && !input.sourceId) return 'Οι δημόσιες εγγραφές χρειάζονται πηγή (project) για το help center.'
  return null
}

async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title)
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const clash = await prisma.knowledgeEntry.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!clash || clash.id === excludeId) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function createKnowledgeEntry(input: EntryInput) {
  const actorId = await requireTriager()
  const invalid = validate(input)
  if (invalid) return { ok: false as const, error: invalid }

  const entry = await prisma.knowledgeEntry.create({
    data: {
      title: input.title.trim().slice(0, 190),
      problem: input.problem.trim().slice(0, 8000),
      solution: input.solution.trim().slice(0, 8000),
      tags: JSON.stringify(input.tags.slice(0, 20)),
      category: input.category,
      projectId: input.projectId,
      sourceId: input.sourceId,
      isPublic: input.isPublic,
      slug: input.isPublic ? await uniqueSlug(input.title) : null,
      approvedById: actorId,
    },
    select: { id: true },
  })
  revalidatePath('/knowledge')
  return { ok: true as const, id: entry.id }
}

export async function updateKnowledgeEntry(input: EntryInput & { id: string }) {
  await requireTriager()
  const invalid = validate(input)
  if (invalid) return { ok: false as const, error: invalid }

  const existing = await prisma.knowledgeEntry.findUnique({ where: { id: input.id }, select: { slug: true } })
  if (!existing) return { ok: false as const, error: 'Η εγγραφή δεν βρέθηκε.' }

  await prisma.knowledgeEntry.update({
    where: { id: input.id },
    data: {
      title: input.title.trim().slice(0, 190),
      problem: input.problem.trim().slice(0, 8000),
      solution: input.solution.trim().slice(0, 8000),
      tags: JSON.stringify(input.tags.slice(0, 20)),
      category: input.category,
      projectId: input.projectId,
      sourceId: input.sourceId,
      isPublic: input.isPublic,
      // Slug: minted on first publish, then stable (public URLs must not break).
      slug: input.isPublic ? existing.slug ?? (await uniqueSlug(input.title, input.id)) : existing.slug,
    },
  })
  revalidatePath('/knowledge')
  revalidatePath(`/knowledge/${input.id}`)
  return { ok: true as const }
}

export async function deleteKnowledgeEntry(id: string) {
  await requireTriager()
  await prisma.knowledgeEntry.delete({ where: { id } })
  revalidatePath('/knowledge')
  return { ok: true as const }
}
