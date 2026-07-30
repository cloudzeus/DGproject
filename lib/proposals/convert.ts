/**
 * Από προσχέδια σε πραγματικές εργασίες και απαιτήσεις.
 *
 * ΔΕΝ περνάει από το createTask του app/(app)/projects/[id]/task-actions.ts.
 * Εκείνο κάνει auto-slot στο ημερολόγιο Outlook του δημιουργού, ελέγχους
 * κύκλων εξαρτήσεων και συγχρονισμό Teams — σωστά όλα για μία εργασία που
 * φτιάχνει άνθρωπος, καταστροφικά για είκοσι που φτιάχνονται μαζί: είκοσι
 * ραντεβού στο ημερολόγιο και είκοσι κάρτες στο κανάλι.
 *
 * Οι εργασίες γεννιούνται σε `todo`, χωρίς ανάθεση. Η ανάθεση γίνεται από το
 * board, όπου φαίνεται ο φόρτος του καθενός.
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type ConvertResult = {
  tasksCreated: number
  requirementsCreated: number
  skipped: number
}

export async function convertProposalItems(args: {
  analysisId: string
  itemIds: string[]
  actorId: string
}): Promise<ConvertResult> {
  const { analysisId, itemIds, actorId } = args
  if (itemIds.length === 0) return { tasksCreated: 0, requirementsCreated: 0, skipped: 0 }

  const analysis = await prisma.proposalAnalysis.findUnique({
    where: { id: analysisId },
    select: {
      id: true,
      projectId: true,
      project: { select: { workspaceId: true, startDate: true } },
    },
  })
  if (!analysis) throw new Error('Η ανάλυση δεν βρέθηκε.')

  // Μόνο προσχέδια αυτής της ανάλυσης. Ένα ήδη μετατραπέν αντικείμενο δεν
  // ξαναγίνεται εργασία, όσες φορές κι αν πατηθεί το κουμπί.
  const items = await prisma.proposalItem.findMany({
    where: { id: { in: itemIds }, analysisId, status: 'draft' },
    orderBy: [{ kind: 'asc' }, { order: 'asc' }],
  })
  const skipped = itemIds.length - items.length
  if (items.length === 0) return { tasksCreated: 0, requirementsCreated: 0, skipped }

  const projectStart = analysis.project.startDate ?? new Date()

  const [maxOrder, lastRequirement] = await Promise.all([
    prisma.task.aggregate({ where: { projectId: analysis.projectId }, _max: { order: true } }),
    prisma.projectRequirement.findFirst({
      where: { projectId: analysis.projectId },
      orderBy: { code: 'desc' },
      select: { code: true },
    }),
  ])

  let nextOrder = (maxOrder._max.order ?? -1) + 1
  let nextReqNumber = parseRequirementNumber(lastRequirement?.code) + 1

  let tasksCreated = 0
  let requirementsCreated = 0

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      if (item.kind === 'requirement') {
        const code = formatRequirementCode(nextReqNumber++)
        const requirement = await tx.projectRequirement.create({
          data: {
            projectId: analysis.projectId,
            code,
            title: item.title,
            description: item.description,
            category: item.requirementCategory,
            sourceAnalysisId: analysis.id,
            sourceQuote: item.sourceQuote,
            createdById: actorId,
          },
        })
        await tx.proposalItem.update({
          where: { id: item.id },
          data: { status: 'converted', convertedRequirementId: requirement.id },
        })
        requirementsCreated++
        continue
      }

      const dueDate = resolveDueDate(item, projectStart)
      const task = await tx.task.create({
        data: {
          projectId: analysis.projectId,
          title: item.title,
          description: item.description,
          status: 'todo',
          priority: item.priority ?? 'medium',
          visibility: item.visibility,
          isMilestone: item.kind === 'milestone',
          dueDate,
          estimatedHours: item.estimatedHours,
          order: nextOrder++,
          createdById: actorId,
          generatedFromProposalId: analysis.id,
          proposalSourceQuote: item.sourceQuote,
          proposalConfidence: item.confidence,
          // Οι εργασίες της πρότασης δεν πάνε στο Outlook ούτε στο Teams: είναι
          // πλάνο, όχι ραντεβού. Ο χρήστης τα ενεργοποιεί ανά εργασία αν θέλει.
          addToCalendar: false,
          addToTeams: false,
        },
      })
      await tx.proposalItem.update({
        where: { id: item.id },
        data: { status: 'converted', convertedTaskId: task.id },
      })
      tasksCreated++
    }

    await tx.activity.create({
      data: {
        workspaceId: analysis.project.workspaceId,
        projectId: analysis.projectId,
        actorId,
        action: 'created',
        targetType: 'project',
        metadata: {
          source: 'proposal-analysis',
          analysisId: analysis.id,
          tasksCreated,
          requirementsCreated,
        } satisfies Prisma.InputJsonValue,
      },
    })
  })

  return { tasksCreated, requirementsCreated, skipped }
}

/**
 * Ρητή ημερομηνία αν την έδωσε ο χρήστης· αλλιώς η μετατόπιση σε μέρες που
 * βρήκε το μοντέλο («εβδομάδα 3») μετρημένη από την έναρξη του έργου. Χωρίς
 * κανένα από τα δύο, η εργασία μένει χωρίς προθεσμία — καλύτερα κενό παρά
 * επινοημένη ημερομηνία που κάποιος θα εμπιστευτεί.
 */
function resolveDueDate(
  item: { suggestedDueDate: Date | null; suggestedOffsetDays: number | null },
  projectStart: Date,
): Date | null {
  if (item.suggestedDueDate) return item.suggestedDueDate
  if (item.suggestedOffsetDays == null) return null

  const d = new Date(projectStart)
  d.setDate(d.getDate() + item.suggestedOffsetDays)
  d.setHours(17, 0, 0, 0)
  return d
}

function formatRequirementCode(n: number): string {
  return `REQ-${String(n).padStart(3, '0')}`
}

function parseRequirementNumber(code: string | undefined): number {
  if (!code) return 0
  const m = /^REQ-(\d+)$/.exec(code)
  return m ? Number(m[1]) : 0
}
