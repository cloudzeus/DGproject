/**
 * Έλεγχος και κανονικοποίηση ΑΦΜ.
 *
 * Καθαρές συναρτήσεις — καμία I/O, ώστε να δοκιμάζονται απομονωμένα.
 */

/** Κρατά μόνο ψηφία — ανέχεται prefix χώρας ("EL094019245" → "094019245"). */
export function normalizeAfm(input: string): string {
  return String(input ?? '').replace(/\D+/g, '')
}

/** Έλεγχος μορφής: ακριβώς 9 ψηφία μετά την κανονικοποίηση. */
export function isValidAfm(input: string): boolean {
  return /^\d{9}$/.test(normalizeAfm(input))
}

/**
 * Ψηφίο ελέγχου ΓΓΠΣ: τα 8 πρώτα ψηφία σταθμίζονται με 2^8…2^1 και το
 * άθροισμα mod 11 mod 10 ισούται με το 9ο ψηφίο.
 *
 * Χρησιμοποιείται ως ΠΡΟΕΙΔΟΠΟΙΗΣΗ στο UI, όχι ως φραγμός: τελική αυθεντία
 * για το αν υπάρχει ένα ΑΦΜ είναι η υπηρεσία της ΑΑΔΕ.
 */
export function hasValidChecksum(input: string): boolean {
  const afm = normalizeAfm(input)
  if (!/^\d{9}$/.test(afm)) return false
  if (afm === '000000000') return false

  let sum = 0
  for (let i = 0; i < 8; i++) sum += Number(afm[i]) * 2 ** (8 - i)
  return (sum % 11) % 10 === Number(afm[8])
}
