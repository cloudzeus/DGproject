/**
 * Πού πρέπει να ανακατευθυνθεί ένας συνδεδεμένος χρήστης, ή `null` αν επιτρέπεται.
 *
 * Καθαρή συνάρτηση, χωριστά από τον proxy, ώστε το gate να είναι δοκιμάσιμο
 * χωρίς HTTP server. Λογική μέσα σε middleware ελέγχεται μόνο χειροκίνητα — που
 * σημαίνει μία φορά και ποτέ ξανά.
 */

/** Σελίδες λογαριασμού, διαθέσιμες σε κάθε τύπο χρήστη. */
const SHARED_PATHS = ['/profile', '/auth/change-password']

/** Οι τύποι χρήστη που ανήκουν στην ομάδα. */
function isStaff(userType: string | undefined): boolean {
  return userType === 'employee' || userType === 'supplier'
}

/**
 * Ο διαχωρισμός πελάτη/ομάδας γίνεται από το ROUTING, όχι από ελέγχους μέσα σε
 * κάθε action: ένα employee route είναι απρόσιτο για πελάτη επειδή ο proxy τον
 * γυρίζει πίσω, χωρίς να χρειάζεται να θυμηθεί κανείς guard σε νέο feature.
 *
 * Fail-closed: οτιδήποτε δεν είναι ρητά `employee`/`supplier` θεωρείται πελάτης
 * και περιορίζεται στο portal — ακόμα κι αν έχει role `admin`.
 */
export function gateRedirect(
  pathname: string,
  userType: string | undefined,
  role: string | undefined,
): string | null {
  if (SHARED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null

  // Segment-aware: το "/portalx" ΔΕΝ είναι μέσα στο portal.
  const inPortal = pathname === '/portal' || pathname.startsWith('/portal/')

  if (!isStaff(userType)) return inPortal ? null : '/portal'
  if (inPortal) return '/dashboard'
  if (pathname.startsWith('/admin') && role !== 'admin') return '/dashboard'
  return null
}
