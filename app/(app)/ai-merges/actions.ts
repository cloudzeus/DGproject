'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { isTaskMergeApprover } from '@/lib/ai/task-merge-rules'
import {
  generateTaskMergeProposals,
  reviewTaskMergeProposal,
  sendAcceptedTaskMergeEmails,
} from '@/lib/ai/task-merge-service'

export type AiMergeActionResult = {
  ok: boolean
  error?: string
  warning?: string
  count?: number
}

async function requirePrivilegedUser() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Απαιτείται σύνδεση.')
  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    throw new Error('Η AI ανάλυση συγχωνεύσεων είναι διαθέσιμη μόνο σε admin/manager.')
  }
  return { id: session.user.id, email: session.user.email ?? '' }
}

async function requireMergeApprover() {
  const user = await requirePrivilegedUser()
  if (!isTaskMergeApprover(user.email)) {
    throw new Error('Μόνο το gkozyris@dgsmart.gr μπορεί να εγκρίνει ή να απορρίψει AI συγχωνεύσεις.')
  }
  return user
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Προέκυψε μη αναμενόμενο σφάλμα.'
}

export async function analyzeProjectForAiMerges(projectId: string): Promise<AiMergeActionResult> {
  try {
    const user = await requirePrivilegedUser()
    const count = await generateTaskMergeProposals(projectId, user.id)
    revalidatePath('/ai-merges')
    return { ok: true, count }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

export async function reviewAiMerge(
  proposalId: string,
  decision: 'approve' | 'reject',
): Promise<AiMergeActionResult> {
  try {
    const user = await requireMergeApprover()
    const result = await reviewTaskMergeProposal(proposalId, user.id, decision)
    revalidatePath('/ai-merges')
    revalidatePath('/board')
    revalidatePath('/reports')
    if (result.delivery?.error) {
      return {
        ok: true,
        warning: `Η συγχώνευση ολοκληρώθηκε, αλλά η αποστολή χρειάζεται επανάληψη: ${result.delivery.error}`,
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

export async function retryAiMergeEmails(proposalId: string): Promise<AiMergeActionResult> {
  try {
    const user = await requireMergeApprover()
    const result = await sendAcceptedTaskMergeEmails(proposalId, user.id)
    revalidatePath('/ai-merges')
    if (result.error) return { ok: false, error: result.error }
    return { ok: true, count: result.sent }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}
