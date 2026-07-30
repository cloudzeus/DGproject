import { prisma } from '@/lib/prisma'
import type { NotificationType } from '@prisma/client'
import { createNotifications } from './index'

/**
 * Ειδοποιήσεις προς ΠΕΛΑΤΕΣ.
 *
 * Το `lib/notifications/index.ts` ειδοποιεί αποκλειστικά την ομάδα: αναθέσεις,
 * εγκρίσεις, αλλαγές κατάστασης προς αναδόχους. Κάθε σημείο εκπομπής του
 * υποθέτει παραλήπτη μέσα στην ομάδα. Εδώ ζει το άλλο μισό.
 *
 * ΓΙΑΤΙ ΧΩΡΙΣΤΟ ΑΡΧΕΙΟ: ο πελάτης δεν είναι «ένας ακόμα παραλήπτης». Κάθε εκπομπή
 * προς τα έξω περνά υποχρεωτικά από πύλη ορατότητας, και θέλουμε ΕΝΑ σημείο να
 * ελεγχθεί σε review. Αν οι δύο ροές ανακατεύονταν, η προσθήκη ενός παραλήπτη σε
 * υπάρχουσα κλήση θα μπορούσε να στείλει εσωτερικό κείμενο σε πελάτη χωρίς να το
 * προσέξει κανείς.
 *
 * ΤΟ FEED ΤΟΥ PORTAL ΕΙΝΑΙ ΑΥΤΕΣ ΟΙ ΕΓΓΡΑΦΕΣ. Η «Πρόσφατη δραστηριότητα» δεν
 * διαβάζει Task/Attachment/Comment — διαβάζει Notification. Έτσι ο έλεγχος
 * ορατότητας γίνεται μία φορά, εδώ, στην εκπομπή· όχι τέσσερις φορές σε τέσσερα
 * read paths όπου θα μπορούσε να ζήσει bug διαρροής.
 */

type Payload = {
  title: string
  message: string
  type: NotificationType
  link?: string
}

/**
 * Οι χρήστες-πελάτες που δικαιούνται να μάθουν για ένα έργο.
 *
 * Σκόπιμα ΜΟΝΟ `primaryCompany`: ταυτίζεται με το `getPortalScope`, που χτίζει
 * το scope αποκλειστικά από `primaryProjects`. Εταιρία συνδεδεμένη ως συνεργάτης
 * ή υπεργολάβος (join row στο ProjectCompany) δεν βλέπει το έργο στο portal της,
 * άρα δεν πρέπει ούτε να ειδοποιείται — αλλιώς θα έπαιρνε ειδοποίηση για κάτι
 * που μετά δεν μπορεί να ανοίξει.
 */
async function customerRecipients(projectId: string): Promise<{
  userIds: string[]
  projectName: string
} | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      isInternal: true,
      primaryCompanyId: true,
      primaryCompany: {
        select: { users: { where: { userType: 'customer' }, select: { id: true } } },
      },
    },
  })

  // Εσωτερικό έργο δεν έχει πελάτη εξ ορισμού· έργο χωρίς primaryCompany δεν έχει
  // ακόμα. Και στις δύο περιπτώσεις δεν υπάρχει παραλήπτης — όχι σφάλμα.
  if (!project || project.isInternal || !project.primaryCompanyId) return null

  const userIds = project.primaryCompany?.users.map((u) => u.id) ?? []
  if (userIds.length === 0) return null

  return { userIds, projectName: project.name }
}

/** Χαμηλού επιπέδου εκπομπή. Οι πύλες ορατότητας ζουν στους καλούντες παρακάτω. */
export async function notifyProjectCustomers(
  projectId: string,
  payload: Payload,
): Promise<void> {
  const recipients = await customerRecipients(projectId)
  if (!recipients) return

  await createNotifications(
    recipients.userIds.map((userId) => ({ userId, ...payload })),
  )
}

/**
 * Ολοκληρώθηκε εργασία.
 *
 * Πύλη: `visibility === 'shared'`. Εσωτερική εργασία δεν εμφανίζεται στο portal,
 * οπότε ειδοποίηση γι' αυτήν θα ήταν και διαρροή τίτλου και σύνδεσμος στο πουθενά.
 */
export async function notifyCustomerTaskCompleted(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, projectId: true, visibility: true },
  })
  if (!task || task.visibility !== 'shared') return

  await notifyProjectCustomers(task.projectId, {
    title: 'Ολοκληρώθηκε εργασία',
    message: `Η εργασία «${task.title}» ολοκληρώθηκε.`,
    type: 'status_change',
    link: `/portal/projects/${task.projectId}`,
  })
}

/**
 * Κοινοποιήθηκε αρχείο.
 *
 * Πύλη: `visibility === 'shared'` ΚΑΙ ο ανεβάζων είναι της ομάδας. Χωρίς το
 * δεύτερο σκέλος, το αρχείο που ανεβάζει ο ίδιος ο πελάτης θα του γύριζε πίσω ως
 * ειδοποίηση για τον εαυτό του — τα αρχεία πελάτη είναι πάντα `shared`
 * (`visibilityForUploader`), οπότε η πρώτη πύλη από μόνη της δεν τα κόβει.
 */
export async function notifyCustomerAttachment(attachmentId: string): Promise<void> {
  const file = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      name: true,
      title: true,
      visibility: true,
      projectId: true,
      task: { select: { projectId: true, visibility: true } },
      uploadedBy: { select: { userType: true } },
    },
  })
  if (!file || file.visibility !== 'shared') return
  if (file.uploadedBy.userType === 'customer') return

  // Αρχείο κρεμασμένο σε εσωτερική εργασία δεν κοινοποιείται, ακόμα κι αν το ίδιο
  // είναι shared: ο πελάτης δεν βλέπει τη μητρική εργασία.
  if (file.task && file.task.visibility !== 'shared') return

  const projectId = file.projectId ?? file.task?.projectId
  if (!projectId) return

  await notifyProjectCustomers(projectId, {
    title: 'Νέο αρχείο',
    message: `Κοινοποιήθηκε το αρχείο «${file.title || file.name}».`,
    type: 'comment',
    link: `/portal/files`,
  })
}

/**
 * Νέο σχόλιο ορατό στον πελάτη.
 *
 * Διπλή πύλη: και το σχόλιο και η εργασία του πρέπει να είναι `shared`. Σχόλιο
 * `shared` πάνω σε εσωτερική εργασία δεν είναι αντιφατικό στο μοντέλο — απλώς δεν
 * έχει πού να εμφανιστεί.
 */
export async function notifyCustomerComment(commentId: string): Promise<void> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      visibility: true,
      author: { select: { name: true, email: true, userType: true } },
      task: { select: { id: true, title: true, projectId: true, visibility: true } },
    },
  })
  if (!comment || comment.visibility !== 'shared') return
  if (comment.task.visibility !== 'shared') return
  if (comment.author.userType === 'customer') return

  const authorName = comment.author.name ?? comment.author.email ?? 'Η ομάδα'

  await notifyProjectCustomers(comment.task.projectId, {
    title: 'Νέο σχόλιο',
    message: `Ο/Η ${authorName} σχολίασε στην εργασία «${comment.task.title}».`,
    type: 'comment',
    link: `/portal/projects/${comment.task.projectId}`,
  })
}

/**
 * Δημοσιεύτηκαν πρακτικά σύσκεψης.
 *
 * Πύλη: `momVisibility === 'shared'`. Καλείται ΜΟΝΟ από την ενέργεια δημοσίευσης,
 * αφού έχει γραφτεί το `momSharedInclude` — ποτέ από το pipeline επεξεργασίας,
 * όπου τα πρακτικά είναι ακόμα ακατέργαστη έξοδος LLM.
 */
export async function notifyCustomerMomPublished(meetingNoteId: string): Promise<void> {
  const meeting = await prisma.meetingNote.findUnique({
    where: { id: meetingNoteId },
    select: { subject: true, projectId: true, momVisibility: true, startedAt: true },
  })
  if (!meeting || meeting.momVisibility !== 'shared') return

  const date = new Intl.DateTimeFormat('el-GR', { dateStyle: 'long' }).format(
    meeting.startedAt,
  )

  await notifyProjectCustomers(meeting.projectId, {
    title: 'Νέα πρακτικά σύσκεψης',
    message: `Δημοσιεύτηκαν τα πρακτικά της σύσκεψης «${meeting.subject}» (${date}).`,
    type: 'meeting',
    link: `/portal/meetings/${meetingNoteId}`,
  })
}

/**
 * Κίνηση σε αίτημα υποστήριξης.
 *
 * Τα αιτήματα δεν κρέμονται από έργο — κλειδώνουν στο email του αναφέροντος.
 * Παραλήπτες: ο ίδιος ο αναφέρων ΚΑΙ οι συνάδελφοί του, γιατί το
 * `getPortalScope` δείχνει τα αιτήματα ανά εταιρία (`scope.emails`, που
 * περιλαμβάνει και επαφές χωρίς λογαριασμό). Αν ειδοποιούσαμε μόνο τον
 * αναφέροντα, ο συνάδελφος θα έβλεπε το αίτημα στη λίστα χωρίς ποτέ να μάθει ότι
 * απαντήθηκε.
 */
export async function notifyTicketReporter(
  ticketId: string,
  payload: Payload,
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { reporterEmail: true },
  })
  if (!ticket) return

  const email = ticket.reporterEmail.trim().toLowerCase()

  // Η εταιρία βρίσκεται είτε από χρήστη με αυτό το email είτε από επαφή — η
  // δεύτερη διαδρομή είναι ο λόγος που οι επαφές μοντελοποιούνται χωριστά.
  const [asUser, asContact] = await Promise.all([
    prisma.user.findFirst({
      where: { email, userType: 'customer' },
      select: { id: true, companyId: true },
    }),
    prisma.contact.findFirst({
      where: { email },
      select: { companyId: true },
    }),
  ])

  const companyId = asUser?.companyId ?? asContact?.companyId
  if (!companyId) return

  const colleagues = await prisma.user.findMany({
    where: { companyId, userType: 'customer' },
    select: { id: true },
  })
  if (colleagues.length === 0) return

  await createNotifications(colleagues.map(({ id }) => ({ userId: id, ...payload })))
}
