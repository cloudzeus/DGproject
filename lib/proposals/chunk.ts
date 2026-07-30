/**
 * Τεμαχισμός της πρότασης σε κομμάτια που χωράνε σε ένα prompt.
 *
 * Οι προτάσεις μας φτάνουν 50+ σελίδες — δεν χωράνε μονοκόμματες. Δύο κανόνες
 * κρατούν την ποιότητα:
 *
 *   1. Κόβουμε σε όρια παραγράφων, όχι στον χαρακτήρα 24000. Μια πρόταση
 *      κομμένη στη μέση γίνεται δύο μισές απαιτήσεις που δεν βγάζουν νόημα.
 *   2. Κάθε τεμάχιο επικαλύπτει το προηγούμενο. Χωρίς επικάλυψη, μια φάση που
 *      ξεκινά λίγο πριν το όριο χάνει το πλαίσιό της.
 *
 * Καθαρή συνάρτηση — ελέγχεται χωρίς βάση και χωρίς δίκτυο.
 */

export type Chunk = {
  index: number
  text: string
  /** Θέση στο αρχικό κείμενο — χρήσιμη για εντοπισμό αποσπάσματος. */
  startOffset: number
}

export const DEFAULT_MAX_CHARS = 24_000
export const DEFAULT_OVERLAP_CHARS = 1_500

/** Πόσο πίσω από το σκληρό όριο ψάχνουμε για όριο παραγράφου πριν τα παρατήσουμε. */
const BOUNDARY_SEARCH_WINDOW = 0.35

export function chunkText(
  text: string,
  opts: { maxChars?: number; overlapChars?: number } = {},
): Chunk[] {
  const maxChars = Math.max(1000, opts.maxChars ?? DEFAULT_MAX_CHARS)
  const overlap = Math.max(0, Math.min(opts.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 2)))

  const clean = text.trim()
  if (clean.length === 0) return []
  if (clean.length <= maxChars) {
    return [{ index: 0, text: clean, startOffset: 0 }]
  }

  const chunks: Chunk[] = []
  let start = 0

  while (start < clean.length) {
    const hardEnd = Math.min(start + maxChars, clean.length)
    const end = hardEnd >= clean.length ? clean.length : findBoundary(clean, start, hardEnd, maxChars)

    const piece = clean.slice(start, end).trim()
    if (piece.length > 0) {
      chunks.push({ index: chunks.length, text: piece, startOffset: start })
    }

    if (end >= clean.length) break

    // Η επόμενη αρχή πάει πίσω κατά την επικάλυψη, αλλά πάντα προχωρά: χωρίς
    // αυτή τη φύλαξη, ένα όριο που βρέθηκε πολύ νωρίς κάνει τον βρόχο αιώνιο.
    const next = end - overlap
    start = next > start ? next : end
  }

  return chunks
}

/**
 * Βρίσκει το καλύτερο σημείο κοπής πριν το `hardEnd`: πρώτα κενή γραμμή, μετά
 * αλλαγή γραμμής, μετά τέλος πρότασης, μετά κενό. Αν τίποτα δεν βρεθεί μέσα
 * στο παράθυρο αναζήτησης, κόβουμε στο σκληρό όριο — ένα κείμενο χωρίς κανένα
 * κενό (π.χ. base64) δεν αξίζει να μπλοκάρει την ανάλυση.
 */
function findBoundary(text: string, start: number, hardEnd: number, maxChars: number): number {
  const floor = start + Math.floor(maxChars * (1 - BOUNDARY_SEARCH_WINDOW))
  const window = text.slice(floor, hardEnd)

  for (const sep of ['\n\n', '\n', '. ', ' ']) {
    const at = window.lastIndexOf(sep)
    if (at !== -1) return floor + at + sep.length
  }

  return hardEnd
}
