/**
 * Ποιες εργασίες βλέπει ο πελάτης.
 *
 * Παράλληλο του lib/comments/visibility.ts, με μία σημαντική διαφορά στο
 * default: τα σχόλια γεννιούνται `internal` (η εσωτερική κουβέντα είναι ο
 * κανόνας), οι εργασίες γεννιούνται `shared` (η δουλειά για τον πελάτη είναι ο
 * κανόνας). Η κατεύθυνση του κάθε default ακολουθεί το τι είναι συχνότερο, όχι
 * μια γενική αρχή.
 *
 * Το φίλτρο ανάγνωσης παραμένει fail-closed: οτιδήποτε δεν είναι ρητά μέλος της
 * ομάδας βλέπει μόνο `shared`.
 */

export type TaskVisibility = 'internal' | 'shared'

function isStaff(userType: string | undefined): boolean {
  return userType === 'employee' || userType === 'supplier'
}

/** Prisma `where` fragment για τις εργασίες που επιτρέπεται να δει ο χρήστης. */
export function taskVisibilityFilter(
  userType: string | undefined,
): { visibility?: TaskVisibility } {
  return isStaff(userType) ? {} : { visibility: 'shared' }
}

/**
 * Μπορεί ο χρήστης να αλλάξει την ορατότητα εργασίας;
 *
 * Όλη η ομάδα υλοποίησης — admin, manager και employees — όχι μόνο διαχειριστές:
 * αυτός που γράφει την εργασία ξέρει αν αφορά τον πελάτη.
 */
export function canSetTaskVisibility(
  userType: string | undefined,
  role: string | undefined,
): boolean {
  if (!isStaff(userType)) return false
  return role === 'admin' || role === 'manager' || role === 'member'
}
