'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { visibilityForAuthor, type CommentVisibility } from '@/lib/comments/visibility'
import { canSetTaskVisibility } from '@/lib/tasks/visibility'

const MAX_LEN = 5000

/**
 * Επιβεβαιώνει ότι ο χρήστης έχει πρόσβαση στην εργασία μέσω του έργου της.
 * Επιστρέφει το projectId για revalidation.
 */
async function assertTaskAccess(taskId: string, userId: string, isPrivileged: boolean) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      projectId: true,
      project: {
        select: {
          ownerId: true,
          members: { where: { userId }, select: { userId: true } },
        },
      },
    },
  })
  if (!task) return { error: 'Δεν βρέθηκε η εργασία.' as const }
  const isMember = task.project.ownerId === userId || task.project.members.length > 0
  if (!isPrivileged && !isMember) return { error: 'Δεν έχεις πρόσβαση σε αυτή την εργασία.' as const }
  return { projectId: task.projectId }
}

export async function addTaskComment(input: {
  taskId: string
  content: string
  visibility?: CommentVisibility
}) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'Απαιτείται σύνδεση.' }
  // Οι πελάτες σχολιάζουν από το portal, με δικό του action και δικό του scope.
  if (session.user.userType === 'customer') return { ok: false as const, error: 'Μη διαθέσιμο.' }

  const content = input.content.trim().slice(0, MAX_LEN)
  if (!content) return { ok: false as const, error: 'Το σχόλιο είναι κενό.' }

  const isPrivileged = session.user.role === 'admin' || session.user.role === 'manager'
  const access = await assertTaskAccess(input.taskId, session.user.id, isPrivileged)
  if ('error' in access) return { ok: false as const, error: access.error }

  await prisma.comment.create({
    data: {
      taskId: input.taskId,
      authorId: session.user.id,
      content,
      visibility: visibilityForAuthor(session.user.userType, input.visibility),
    },
  })

  revalidatePath(`/projects/${access.projectId}`)
  return { ok: true as const }
}

/** Αλλαγή ορατότητας υπάρχοντος σχολίου — μόνο ο συντάκτης ή admin. */
export async function setCommentVisibility(commentId: string, visibility: CommentVisibility) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'Απαιτείται σύνδεση.' }
  if (session.user.userType === 'customer') return { ok: false as const, error: 'Μη διαθέσιμο.' }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      author: { select: { userType: true } },
      task: { select: { projectId: true } },
    },
  })
  if (!comment) return { ok: false as const, error: 'Δεν βρέθηκε το σχόλιο.' }
  if (comment.authorId !== session.user.id && session.user.role !== 'admin') {
    return { ok: false as const, error: 'Μόνο ο συντάκτης μπορεί να αλλάξει την ορατότητα.' }
  }
  // Σχόλιο πελάτη δεν γίνεται εσωτερικό — θα εξαφανιζόταν από τον συντάκτη του.
  if (comment.author.userType === 'customer') {
    return { ok: false as const, error: 'Τα σχόλια πελάτη είναι πάντα κοινά.' }
  }

  await prisma.comment.update({ where: { id: commentId }, data: { visibility } })
  revalidatePath(`/projects/${comment.task.projectId}`)
  return { ok: true as const }
}

export async function deleteTaskComment(commentId: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'Απαιτείται σύνδεση.' }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, task: { select: { projectId: true } } },
  })
  if (!comment) return { ok: false as const, error: 'Δεν βρέθηκε το σχόλιο.' }
  if (comment.authorId !== session.user.id && session.user.role !== 'admin') {
    return { ok: false as const, error: 'Μόνο ο συντάκτης μπορεί να το διαγράψει.' }
  }

  await prisma.comment.delete({ where: { id: commentId } })
  revalidatePath(`/projects/${comment.task.projectId}`)
  return { ok: true as const }
}

/**
 * Αλλάζει αν ο πελάτης βλέπει την εργασία στο portal.
 *
 * Το κάνει όλη η ομάδα υλοποίησης, όχι μόνο διαχειριστές: αυτός που γράφει την
 * εργασία ξέρει αν αφορά τον πελάτη ή μόνο εμάς.
 */
export async function setTaskVisibility(taskId: string, visibility: 'internal' | 'shared') {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'Απαιτείται σύνδεση.' }
  if (!canSetTaskVisibility(session.user.userType, session.user.role)) {
    return { ok: false as const, error: 'Δεν έχεις δικαίωμα αλλαγής ορατότητας.' }
  }

  const isPrivileged = session.user.role === 'admin' || session.user.role === 'manager'
  const access = await assertTaskAccess(taskId, session.user.id, isPrivileged)
  if ('error' in access) return { ok: false as const, error: access.error }

  await prisma.task.update({ where: { id: taskId }, data: { visibility } })
  revalidatePath(`/projects/${access.projectId}`)
  return { ok: true as const }
}
