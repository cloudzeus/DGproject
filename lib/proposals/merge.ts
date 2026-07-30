/**
 * Συγχώνευση των αποτελεσμάτων των τεμαχίων σε μία λίστα.
 *
 * Η επικάλυψη του τεμαχισμού είναι σκόπιμη — και έχει τίμημα: η ίδια φάση
 * εμφανίζεται σε δύο διαδοχικά τεμάχια και επιστρέφεται δύο φορές. Εδώ φεύγουν
 * τα διπλά, κρατώντας κάθε φορά την πληρέστερη εκδοχή.
 *
 * Καθαρές συναρτήσεις — ελέγχονται χωρίς βάση και χωρίς δίκτυο.
 */

import type { ExtractedItem } from './types'

/**
 * Κανονικοποίηση τίτλου για σύγκριση: πεζά, χωρίς τόνους, χωρίς σημεία στίξης.
 * Το τελικό «ς» γίνεται «σ» ώστε «Ανάλυση Απαιτήσεων» και «ΑΝΑΛΥΣΗ ΑΠΑΙΤΗΣΕΩΝ»
 * να ταυτίζονται όπως και «τέλος»/«τέλοσ».
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Κρατά ένα αντικείμενο ανά (είδος, κανονικοποιημένος τίτλος).
 *
 * Νικητής είναι το πληρέστερο, όχι το πρώτο: σε επικάλυψη τεμαχίων το δεύτερο
 * αντίγραφο συχνά έχει περισσότερο κείμενο γύρω του και βγάζει καλύτερη
 * περιγραφή. Ισοπαλία στην πληρότητα λύνεται με τη βεβαιότητα.
 */
export function dedupeItems(items: ExtractedItem[]): ExtractedItem[] {
  const best = new Map<string, ExtractedItem>()

  for (const item of items) {
    const key = `${item.kind}::${normalizeTitle(item.title)}`
    const existing = best.get(key)
    if (!existing || score(item) > score(existing)) {
      best.set(key, existing ? mergePair(existing, item) : item)
    } else {
      best.set(key, mergePair(item, existing))
    }
  }

  return Array.from(best.values())
}

/**
 * Ενώνει δύο εκδοχές του ίδιου αντικειμένου: ο νικητής δίνει τη μορφή, ο
 * ηττημένος συμπληρώνει ό,τι λείπει. Έτσι μια ημερομηνία που εμφανίστηκε μόνο
 * στο ένα τεμάχιο δεν χάνεται επειδή το άλλο τεμάχιο είχε καλύτερη περιγραφή.
 */
function mergePair(winner: ExtractedItem, loser: ExtractedItem): ExtractedItem {
  return {
    ...winner,
    description: winner.description || loser.description,
    sourceQuote: winner.sourceQuote || loser.sourceQuote,
    suggestedOffsetDays: winner.suggestedOffsetDays ?? loser.suggestedOffsetDays,
    estimatedHours: winner.estimatedHours ?? loser.estimatedHours,
    priority: winner.priority ?? loser.priority,
    requirementCategory: winner.requirementCategory ?? loser.requirementCategory,
    confidence: Math.max(winner.confidence, loser.confidence),
  }
}

function score(item: ExtractedItem): number {
  const filled =
    (item.description ? 2 : 0) +
    (item.sourceQuote ? 1 : 0) +
    (item.suggestedOffsetDays != null ? 1 : 0) +
    (item.estimatedHours != null ? 1 : 0)
  return filled * 10 + item.confidence
}

/** Σταθερή σειρά: πρώτα τα βήματα, μετά τα ορόσημα, μετά οι απαιτήσεις. */
const KIND_ORDER: Record<ExtractedItem['kind'], number> = {
  step: 0,
  milestone: 1,
  requirement: 2,
}

/**
 * Ταξινόμηση για εμφάνιση. Μέσα σε κάθε είδος διατηρείται η σειρά που ήρθε από
 * τα τεμάχια — δηλαδή η σειρά της πρότασης, που είναι και η σειρά υλοποίησης.
 */
export function sortItems(items: ExtractedItem[]): ExtractedItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.i - b.i)
    .map(({ item }) => item)
}
