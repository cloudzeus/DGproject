'use server'

/**
 * Actions του tab «Πρόταση».
 *
 * Όλα περνούν από `requirePrivileged`: το tab κρύβεται από μέλη και πελάτες
 * στο UI, αλλά η πύλη ξαναελέγχεται εδώ σε περίπτωση που κάποιος καλέσει το
 * action απευθείας — ίδια λογική με το cost-actions.ts.
 */

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { convertProposalItems } from '@/lib/proposals/convert'
import { regenerateProposalItem } from '@/lib/proposals/regenerate'

type Result<T = void> = { ok: true; data: T } | { ok: false; error: string }

async function requirePrivileged(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const role = session.user.role
  if (role !== 'admin' && role !== 'manager') throw new Error('Forbidden')
  return session.user.id
}

/** Επιστρέφει το projectId της ανάλυσης — και επιβεβαιώνει ότι υπάρχει. */
async function analysisProject(analysisId: string): Promise<string> {
  const a = await prisma.proposalAnalysis.findUnique({
    where: { id: analysisId },
    select: { projectId: true },
  })
  if (!a) throw new Error('Η ανάλυση δεν βρέθηκε.')
  return a.projectId
}

function fail(err: unknown): { ok: false; error: string } {
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'Unauthorized' || message === 'Forbidden') {
    return { ok: false, error: 'Δεν έχεις δικαίωμα σε αυτή την ενέργεια.' }
  }
  return { ok: false, error: message }
}

/**
 * Κατάσταση για το polling του UI. Χωριστό, μικρό action: το tab το καλεί κάθε
 * τρία δευτερόλεπτα όσο τρέχει η ανάλυση και δεν έχει νόημα να ξανακατεβάζει
 * ολόκληρη τη λίστα αντικειμένων σε κάθε χτύπο.
 */
export async function getProposalStatus(analysisId: string): Promise<
  Result<{ status: string; chunkCount: number; itemCount: number; aiError: string | null }>
> {
  try {
    await requirePrivileged()
    const a = await prisma.proposalAnalysis.findUnique({
      where: { id: analysisId },
      select: {
        status: true,
        chunkCount: true,
        aiError: true,
        _count: { select: { items: true } },
      },
    })
    if (!a) return { ok: false, error: 'Η ανάλυση δεν βρέθηκε.' }
    return {
      ok: true,
      data: {
        status: a.status,
        chunkCount: a.chunkCount,
        itemCount: a._count.items,
        aiError: a.aiError,
      },
    }
  } catch (err) {
    return fail(err)
  }
}

export async function retryProposalAnalysis(analysisId: string): Promise<Result> {
  try {
    await requirePrivileged()
    const projectId = await analysisProject(analysisId)

    await prisma.proposalAnalysis.update({
      where: { id: analysisId },
      data: { status: 'pending', aiError: null },
    })

    void import('@/lib/proposals/analyze')
      .then((m) => m.runProposalAnalysis(analysisId))
      .catch((err) => console.error('[proposals] η επανάληψη απέτυχε:', err))

    revalidatePath(`/projects/${projectId}`)
    return { ok: true, data: undefined }
  } catch (err) {
    return fail(err)
  }
}

type ItemPatch = {
  title?: string
  description?: string | null
  suggestedDueDate?: string | null
  estimatedHours?: number | null
  priority?: 'low' | 'medium' | 'high' | 'urgent' | null
  visibility?: 'shared' | 'internal'
  requirementCategory?: string | null
  kind?: 'step' | 'milestone' | 'requirement'
  assigneeId?: string | null
}

export async function updateProposalItem(itemId: string, patch: ItemPatch): Promise<Result> {
  try {
    await requirePrivileged()
    const item = await prisma.proposalItem.findUnique({
      where: { id: itemId },
      select: { status: true, analysis: { select: { projectId: true } } },
    })
    if (!item) return { ok: false, error: 'Το αντικείμενο δεν βρέθηκε.' }
    if (item.status === 'converted') {
      return { ok: false, error: 'Έχει ήδη γίνει εργασία — άλλαξέ το από το board.' }
    }

    const title = patch.title?.trim()
    if (title !== undefined && title.length < 3) {
      return { ok: false, error: 'Ο τίτλος είναι πολύ σύντομος.' }
    }
    if (patch.estimatedHours != null && (!Number.isFinite(patch.estimatedHours) || patch.estimatedHours < 0)) {
      return { ok: false, error: 'Μη έγκυρες ώρες.' }
    }

    await prisma.proposalItem.update({
      where: { id: itemId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(patch.description !== undefined ? { description: patch.description || null } : {}),
        ...(patch.suggestedDueDate !== undefined
          ? { suggestedDueDate: patch.suggestedDueDate ? new Date(patch.suggestedDueDate) : null }
          : {}),
        ...(patch.estimatedHours !== undefined ? { estimatedHours: patch.estimatedHours } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
        ...(patch.requirementCategory !== undefined
          ? { requirementCategory: patch.requirementCategory || null }
          : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId || null } : {}),
      },
    })

    revalidatePath(`/projects/${item.analysis.projectId}`)
    return { ok: true, data: undefined }
  } catch (err) {
    return fail(err)
  }
}

export async function addProposalItem(
  analysisId: string,
  input: { kind: 'step' | 'milestone' | 'requirement'; title: string; description?: string },
): Promise<Result<{ id: string }>> {
  try {
    await requirePrivileged()
    const projectId = await analysisProject(analysisId)

    const title = input.title.trim()
    if (title.length < 3) return { ok: false, error: 'Ο τίτλος είναι πολύ σύντομος.' }

    const max = await prisma.proposalItem.aggregate({
      where: { analysisId, kind: input.kind },
      _max: { order: true },
    })

    const item = await prisma.proposalItem.create({
      data: {
        analysisId,
        kind: input.kind,
        title,
        description: input.description?.trim() || null,
        order: (max._max.order ?? -1) + 1,
        // Χειροκίνητο: επιβιώνει μιας νέας ανάλυσης, και δεν έχει απόσπασμα
        // γιατί δεν το βρήκε το μοντέλο — το έγραψε άνθρωπος.
        manual: true,
        confidence: 1,
      },
      select: { id: true },
    })

    revalidatePath(`/projects/${projectId}`)
    return { ok: true, data: { id: item.id } }
  } catch (err) {
    return fail(err)
  }
}

/**
 * Απόρριψη αντί για διαγραφή: το απορριφθέν μένει στη βάση ώστε μια νέα
 * ανάλυση να μην το ξαναφέρει. Διαγραφή θα σήμαινε ότι το ίδιο αντικείμενο
 * επανεμφανίζεται σε κάθε προσπάθεια και ο χρήστης το απορρίπτει ξανά και ξανά.
 */
export async function setProposalItemRejected(itemId: string, rejected: boolean): Promise<Result> {
  try {
    await requirePrivileged()
    const item = await prisma.proposalItem.findUnique({
      where: { id: itemId },
      select: { status: true, analysis: { select: { projectId: true } } },
    })
    if (!item) return { ok: false, error: 'Το αντικείμενο δεν βρέθηκε.' }
    if (item.status === 'converted') {
      return { ok: false, error: 'Έχει ήδη γίνει εργασία — διάγραψέ την από το board.' }
    }

    await prisma.proposalItem.update({
      where: { id: itemId },
      data: { status: rejected ? 'rejected' : 'draft' },
    })

    revalidatePath(`/projects/${item.analysis.projectId}`)
    return { ok: true, data: undefined }
  } catch (err) {
    return fail(err)
  }
}

/**
 * «Δεν το κατάλαβε — ξαναφτιάξ' το έτσι.»
 *
 * Μπορεί να γυρίσει ΠΕΡΙΣΣΟΤΕΡΑ από ένα αντικείμενα: η συνηθέστερη διευκρίνιση
 * είναι ακριβώς «αυτό δεν είναι ένα βήμα, είναι τρία». Το αρχικό μένει στη
 * βάση σημαδεμένο ως αντικαταστάθηκε.
 */
export async function regenerateProposalItemWithClarification(
  itemId: string,
  clarification: string,
): Promise<Result<{ created: number; titles: string[] }>> {
  try {
    await requirePrivileged()

    const item = await prisma.proposalItem.findUnique({
      where: { id: itemId },
      select: { analysis: { select: { projectId: true } } },
    })
    if (!item) return { ok: false, error: 'Το αντικείμενο δεν βρέθηκε.' }

    const result = await regenerateProposalItem({ itemId, clarification })

    revalidatePath(`/projects/${item.analysis.projectId}`)
    return { ok: true, data: result }
  } catch (err) {
    return fail(err)
  }
}

export async function convertSelectedProposalItems(
  analysisId: string,
  itemIds: string[],
): Promise<
  Result<{ tasksCreated: number; requirementsCreated: number; skipped: number; notified: number }>
> {
  try {
    const actorId = await requirePrivileged()
    const projectId = await analysisProject(analysisId)

    if (itemIds.length === 0) return { ok: false, error: 'Δεν επιλέχθηκε τίποτα.' }

    const result = await convertProposalItems({ analysisId, itemIds, actorId })

    revalidatePath(`/projects/${projectId}`)
    return { ok: true, data: result }
  } catch (err) {
    return fail(err)
  }
}
