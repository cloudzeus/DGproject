'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { analyzeTaskContractCoverage } from '@/lib/contracts/coverage'
import { canCheckProjectContract } from '@/lib/contracts/policy'

async function requireInternalProjectEditor(projectId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Δεν έχεις δικαίωμα ελέγχου σύμβασης.')
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, members: { select: { userId: true } } },
  })
  if (!project) throw new Error('Το έργο δεν βρέθηκε.')
  if (!canCheckProjectContract({
    id: session.user.id,
    role: session.user.role,
    userType: session.user.userType ?? '',
  }, project)) throw new Error('Δεν έχεις δικαίωμα ελέγχου σύμβασης.')
  return session.user.id
}

export async function checkTaskContractCoverage(projectId: string, taskId: string) {
  let actorId: string
  try { actorId = await requireInternalProjectEditor(projectId) } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Δεν επιτρέπεται η ενέργεια.' }
  }
  const [contract, task] = await Promise.all([
    prisma.projectContract.findUnique({ where: { projectId }, select: { id: true, extractedText: true } }),
    prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, projectId: true, title: true, description: true,
        project: {
          select: {
            name: true, owner: { select: { name: true, companyName: true } }, primaryCompany: { select: { NAME: true } },
            members: { select: { user: { select: { name: true, companyName: true } } } },
          },
        },
      },
    }),
  ])
  if (!contract) return { ok: false as const, error: 'Ανέβασε πρώτα τη σύμβαση του έργου.' }
  if (!task) return { ok: false as const, error: 'Η εργασία δεν βρέθηκε.' }
  if (task.projectId !== projectId) return { ok: false as const, error: 'Η εργασία δεν ανήκει στο έργο.' }

  try {
    const result = await analyzeTaskContractCoverage({
      contractText: contract.extractedText,
      taskTitle: task.title,
      taskDescription: task.description,
      sensitiveNames: [
        task.project.name, task.project.owner.name, task.project.owner.companyName, task.project.primaryCompany?.NAME,
        ...task.project.members.flatMap((member) => [member.user.name, member.user.companyName]),
      ].filter((name): name is string => Boolean(name)),
    })
    const check = await prisma.taskContractCheck.upsert({
      where: { contractId_taskId: { contractId: contract.id, taskId } },
      create: { contractId: contract.id, taskId, checkedById: actorId, ...result },
      update: { checkedById: actorId, createdAt: new Date(), ...result },
      select: { coverage: true, confidence: true, evidence: true, explanation: true, createdAt: true },
    })
    revalidatePath(`/projects/${projectId}`)
    return { ok: true as const, data: check }
  } catch (error) {
    console.error('[contract] task coverage analysis failed:', error)
    return { ok: false as const, error: error instanceof Error ? error.message : 'Η ανάλυση της σύμβασης απέτυχε.' }
  }
}
