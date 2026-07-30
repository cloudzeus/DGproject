import { prisma } from '@/lib/prisma'

/**
 * Το ΜΟΝΟ σημείο που ορίζει τι βλέπει μια εταιρία στο portal.
 *
 * Καμία σελίδα του portal δεν χτίζει δικό της φίλτρο — όλες παίρνουν το `where`
 * τους από εδώ. Αυτό είναι το μοναδικό σημείο που πρέπει να ελεγχθεί σε review
 * και το μοναδικό όπου μπορεί να ζήσει bug ορατότητας.
 */

export type PortalScope = {
  companyId: string
  companyName: string
  /** Χρήστες της εταιρίας — για ερωτήσεις και ταυτοποίηση συντακτών σχολίων. */
  userIds: string[]
  /**
   * Emails χρηστών ΚΑΙ επαφών, σε lowercase. Οι επαφές μπαίνουν ώστε ticket που
   * άνοιξε συνάδελφος χωρίς λογαριασμό να φαίνεται στην εταιρία — αυτός είναι ο
   * λόγος που οι επαφές μοντελοποιούνται χωριστά από τους χρήστες.
   */
  emails: string[]
  /** Έργα όπου η εταιρία είναι ΠΕΛΑΤΗΣ. Όχι συνεργάτης, όχι υπεργολάβος. */
  projectIds: string[]
}

type SessionUserLike = { userType?: string; companyId?: string | null } | undefined

/**
 * Fail-closed έλεγχος: μόνο `customer` ΜΕ εταιρία μπαίνει στο portal.
 *
 * Χρήστης χωρίς εταιρία δεν σημαίνει «δείξε του τα πάντα» — σημαίνει «δεν έχει
 * τίποτα να δει».
 */
export function isPortalUser(user: SessionUserLike): boolean {
  return user?.userType === 'customer' && Boolean(user.companyId)
}

/**
 * `null` σημαίνει «δεν υπάρχει scope»: η σελίδα δείχνει empty state και ΔΕΝ
 * επιστρέφει αφιλτράριστα δεδομένα.
 */
export async function getPortalScope(userId: string): Promise<PortalScope | null> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true, companyId: true },
  })
  if (!isPortalUser(me ?? undefined)) return null

  const company = await prisma.company.findUnique({
    where: { id: me!.companyId! },
    select: {
      id: true,
      NAME: true,
      users: { select: { id: true, email: true } },
      contacts: { select: { email: true } },
      primaryProjects: { select: { id: true } },
    },
  })
  if (!company) return null

  const emails = new Set<string>()
  for (const u of company.users) if (u.email) emails.add(u.email.trim().toLowerCase())
  for (const c of company.contacts) if (c.email) emails.add(c.email.trim().toLowerCase())

  return {
    companyId: company.id,
    companyName: company.NAME,
    userIds: company.users.map((u) => u.id),
    emails: [...emails],
    // ΜΟΝΟ primaryProjects. Δεν γίνεται ποτέ join στο ProjectCompany: εταιρία
    // συνδεδεμένη ως συνεργάτης ή υπεργολάβος δεν βλέπει το έργο στο δικό της
    // portal. Η διάκριση είναι δομική — ο πελάτης είναι FK, οι υπόλοιποι join
    // rows — ώστε να μην μπορεί να παραβιαστεί από λάθος flag.
    projectIds: company.primaryProjects.map((p) => p.id),
  }
}
