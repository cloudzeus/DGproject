import { prisma } from '@/lib/prisma'
import { filterMomInsights, type MomIncludeFilter } from '@/lib/meeting-mom'
import type { ActionItem, Decision, Risk, OpenQuestion } from '@/lib/llm/types'
import type { PortalScope } from './scope'

/**
 * Τα πρακτικά συσκέψεων που βλέπει ο πελάτης.
 *
 * ΤΟ ΜΟΝΟ σημείο που διαβάζει MeetingNote για λογαριασμό πελάτη. Καμία σελίδα
 * του portal δεν χτίζει δικό της query — όπως και με το `getPortalScope`, αυτό
 * είναι το μοναδικό σημείο που χρειάζεται έλεγχο σε review.
 *
 * Η πύλη είναι ΔΙΠΛΗ και τα δύο σκέλη είναι ανεξάρτητα:
 *   1. `projectId ∈ scope.projectIds` — η σύσκεψη ανήκει σε έργο του πελάτη
 *   2. `momVisibility === 'shared'`   — η ομάδα τη δημοσίευσε ρητά
 *
 * Και μετά τρίτο επίπεδο, μέσα στο ίδιο το περιεχόμενο: το αποθηκευμένο
 * `momSharedInclude` κόβει ό,τι δεν τσεκαρίστηκε. Ένα ρίσκο που η ομάδα άφησε
 * ξετσέκαρο δεν φεύγει ποτέ από τον server — δεν κρύβεται με CSS, δεν στέλνεται
 * και δεν φιλτράρεται στον client.
 */

export type PortalMeetingSummary = {
  id: string
  subject: string
  startedAt: string
  durationSec: number
  projectId: string
  projectName: string
  projectColor: string
  /** Πόσα στοιχεία επέζησαν του φίλτρου — τροφοδοτεί τα μετρητικά στην κάρτα. */
  counts: { decisions: number; actionItems: number; risks: number; openQuestions: number }
  hasSummary: boolean
}

export type PortalMeetingDetail = PortalMeetingSummary & {
  summary: string | null
  decisions: Decision[]
  actionItems: ActionItem[]
  risks: Risk[]
  openQuestions: OpenQuestion[]
}

/** Τα JSON πεδία του Prisma είναι `unknown` — εδώ γίνεται η μοναδική παραδοχή σχήματος. */
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function asFilter(v: unknown): MomIncludeFilter | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as MomIncludeFilter) : undefined
}

const SELECT = {
  id: true,
  subject: true,
  startedAt: true,
  durationSec: true,
  projectId: true,
  summary: true,
  decisions: true,
  actionItems: true,
  risks: true,
  openQuestions: true,
  momSharedInclude: true,
  project: { select: { name: true, color: true } },
} as const

type Row = {
  id: string
  subject: string
  startedAt: Date
  durationSec: number
  projectId: string
  summary: string | null
  decisions: unknown
  actionItems: unknown
  risks: unknown
  openQuestions: unknown
  momSharedInclude: unknown
  project: { name: string; color: string }
}

function toDetail(row: Row): PortalMeetingDetail {
  const filtered = filterMomInsights(
    {
      summary: row.summary,
      decisions: asArray<Decision>(row.decisions),
      actionItems: asArray<ActionItem>(row.actionItems),
      risks: asArray<Risk>(row.risks),
      openQuestions: asArray<OpenQuestion>(row.openQuestions),
    },
    asFilter(row.momSharedInclude),
  )

  return {
    id: row.id,
    subject: row.subject,
    startedAt: row.startedAt.toISOString(),
    durationSec: row.durationSec,
    projectId: row.projectId,
    projectName: row.project.name,
    projectColor: row.project.color,
    hasSummary: Boolean(filtered.summary),
    counts: {
      decisions: filtered.decisions.length,
      actionItems: filtered.actionItems.length,
      risks: filtered.risks.length,
      openQuestions: filtered.openQuestions.length,
    },
    ...filtered,
  }
}

/**
 * Δημοσιευμένα πρακτικά, νεότερα πρώτα.
 *
 * `projectId` προαιρετικό: όταν δοθεί, περιορίζει σε ένα έργο — αλλά ΠΑΝΤΑ σε
 * τομή με το scope, ποτέ ως αντικατάστασή του. Έτσι το id που έρχεται από URL
 * δεν μπορεί να διευρύνει την πρόσβαση.
 */
export async function listSharedMeetings(
  scope: PortalScope,
  opts: { projectId?: string; take?: number } = {},
): Promise<PortalMeetingSummary[]> {
  const projectIds = opts.projectId
    ? scope.projectIds.filter((id) => id === opts.projectId)
    : scope.projectIds

  if (projectIds.length === 0) return []

  const rows = await prisma.meetingNote.findMany({
    where: { projectId: { in: projectIds }, momVisibility: 'shared' },
    select: SELECT,
    orderBy: { startedAt: 'desc' },
    take: opts.take ?? 50,
  })

  return rows.map(toDetail)
}

/** `null` σημαίνει «δεν υπάρχει ή δεν επιτρέπεται» — ποτέ δεν διακρίνονται τα δύο. */
export async function getSharedMeeting(
  scope: PortalScope,
  meetingId: string,
): Promise<PortalMeetingDetail | null> {
  if (scope.projectIds.length === 0) return null

  const row = await prisma.meetingNote.findFirst({
    where: {
      id: meetingId,
      momVisibility: 'shared',
      projectId: { in: scope.projectIds },
    },
    select: SELECT,
  })

  return row ? toDetail(row) : null
}
