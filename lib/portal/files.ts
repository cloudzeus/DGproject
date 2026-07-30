import { prisma } from '@/lib/prisma'
import { attachmentVisibilityFilter } from '@/lib/attachments/visibility'
import { taskVisibilityFilter } from '@/lib/tasks/visibility'
import type { PortalScope } from './scope'

/**
 * Τα αρχεία που βλέπει ο πελάτης, σε όλα του τα έργα.
 *
 * ΤΟ ΜΟΝΟ σημείο που διαβάζει Attachment για λογαριασμό πελάτη εκτός της σελίδας
 * έργου. Το dashboard και το αρχειοθέτιο περνούν και τα δύο από εδώ — δύο query
 * θα σήμαινε δύο αντίγραφα της τριπλής πύλης, και το ένα θα ξεχνούσε το τρίτο
 * σκέλος πρώτο.
 *
 * ΤΡΙΠΛΗ πύλη:
 *   1. `projectId ∈ scope.projectIds`
 *   2. `visibility === 'shared'`
 *   3. αν κρέμεται σε εργασία, η εργασία πρέπει να είναι κι αυτή `shared`
 *
 * Το (3) είναι το εύκολο να ξεχαστεί: `shared` αρχείο πάνω σε `internal` εργασία
 * δεν είναι αντίφαση στο μοντέλο, αλλά η εμφάνισή του αποκαλύπτει δουλειά που ο
 * πελάτης δεν ξέρει ότι γίνεται.
 */

export type PortalFileRow = {
  id: string
  name: string
  title: string | null
  size: number
  mimeType: string
  url: string
  createdAt: string
  uploadedByName: string
  fromUs: boolean
  projectId: string | null
  projectName: string | null
}

export async function listSharedFiles(
  scope: PortalScope,
  opts: { projectId?: string; take?: number } = {},
): Promise<PortalFileRow[]> {
  const projectIds = opts.projectId
    ? scope.projectIds.filter((id) => id === opts.projectId)
    : scope.projectIds

  if (projectIds.length === 0) return []

  const rows = await prisma.attachment.findMany({
    where: {
      projectId: { in: projectIds },
      ...attachmentVisibilityFilter('customer'),
      OR: [{ taskId: null }, { task: taskVisibilityFilter('customer') }],
    },
    select: {
      id: true,
      name: true,
      title: true,
      size: true,
      mimeType: true,
      url: true,
      createdAt: true,
      uploadedById: true,
      uploadedBy: { select: { name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 300,
  })

  const ours = new Set(scope.userIds)

  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    title: f.title,
    size: f.size,
    mimeType: f.mimeType,
    url: f.url,
    createdAt: f.createdAt.toISOString(),
    uploadedByName: f.uploadedBy.name ?? f.uploadedBy.email ?? 'Η ομάδα',
    fromUs: ours.has(f.uploadedById),
    projectId: f.project?.id ?? null,
    projectName: f.project?.name ?? null,
  }))
}
