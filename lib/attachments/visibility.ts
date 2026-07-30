/**
 * Ποια αρχεία βλέπει ο πελάτης.
 *
 * Default `internal`, αντίθετα από το Task.visibility. Ο λόγος είναι ο ίδιος
 * κανόνας σε διαφορετικά δεδομένα: στα αρχεία έργου υπάρχουν ήδη προσφορές και
 * εσωτερικά σχέδια, οπότε αναδρομική έκθεση θα ήταν διαρροή· στις εργασίες η
 * πλειοψηφία αφορούσε τον πελάτη. Το default ακολουθεί τι είναι συχνό ανά
 * μοντέλο, όχι μια γενική αρχή.
 */

export type AttachmentVisibility = 'internal' | 'shared'

function isStaff(userType: string | undefined): boolean {
  return userType === 'employee' || userType === 'supplier'
}

/** Fail-closed: ό,τι δεν είναι ρητά ομάδα βλέπει μόνο shared. */
export function attachmentVisibilityFilter(
  userType: string | undefined,
): { visibility?: AttachmentVisibility } {
  return isStaff(userType) ? {} : { visibility: 'shared' }
}

/** Αρχείο που ανεβάζει ο πελάτης είναι πάντα shared — αλλιώς θα εξαφανιζόταν από αυτόν. */
export function visibilityForUploader(
  userType: string | undefined,
  requested: AttachmentVisibility | undefined,
): AttachmentVisibility {
  if (!isStaff(userType)) return 'shared'
  return requested === 'shared' ? 'shared' : 'internal'
}
