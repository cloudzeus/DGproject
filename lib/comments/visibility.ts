/**
 * Ποιος βλέπει ποια σχόλια, και με ποια ορατότητα γράφεται ένα νέο.
 *
 * Καθαρές συναρτήσεις, καμία I/O. Μία υλοποίηση του κανόνα ώστε το staff UI και
 * το portal να μην μπορούν να διαφωνήσουν — αν ο κανόνας αντιγραφόταν, μια
 * αλλαγή στη μία πλευρά θα άφηνε την άλλη πίσω.
 */

export type CommentVisibility = 'internal' | 'shared'

/** Οι τύποι χρήστη που θεωρούνται «μέσα στην ομάδα». */
function isStaff(userType: string | undefined): boolean {
  return userType === 'employee' || userType === 'supplier'
}

/**
 * Prisma `where` fragment για τα σχόλια που επιτρέπεται να δει ο χρήστης.
 * Κενό αντικείμενο = κανένας περιορισμός.
 *
 * Fail-closed: οτιδήποτε δεν είναι ρητά μέλος της ομάδας περιορίζεται στα
 * `shared`. Αν προστεθεί κάποτε νέος userType και ξεχαστεί εδώ, θα βλέπει
 * λιγότερα αντί για περισσότερα.
 */
export function commentVisibilityFilter(
  userType: string | undefined,
): { visibility?: CommentVisibility } {
  return isStaff(userType) ? {} : { visibility: 'shared' }
}

/**
 * Η ορατότητα με την οποία αποθηκεύεται ένα νέο σχόλιο.
 *
 * Ο πελάτης δεν μπορεί να γράψει κρυφό σχόλιο — ό,τι γράφει είναι εξ ορισμού
 * ορατό και στην ομάδα και στον ίδιο. Η ομάδα επιλέγει, με default `internal`
 * ώστε η παράλειψη να μη διαρρέει.
 */
export function visibilityForAuthor(
  userType: string | undefined,
  requested: CommentVisibility | undefined,
): CommentVisibility {
  if (!isStaff(userType)) return 'shared'
  return requested === 'shared' ? 'shared' : 'internal'
}
