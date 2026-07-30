/**
 * Εναλλακτικά μοντέλα όταν το κύριο είναι υπερφορτωμένο.
 *
 * Προσαρμογή από το damask (src/lib/ocr/model-fallback.ts). Η επανάληψη στο
 * ΙΔΙΟ μοντέλο (fetch-retry.ts) δεν βοηθά σε παρατεταμένη υπερφόρτωση — ένα
 * ΑΛΛΟ μοντέλο έχει ξεχωριστή δεξαμενή χωρητικότητας.
 */

/** Πρώτα το κύριο, μετά τα εναλλακτικά· χωρίς κενά και χωρίς διπλά. */
export function buildModelChain(primary: string, fallbacks: string[]): string[] {
  const seen = new Set<string>()
  const chain: string[] = []
  for (const m of [primary, ...fallbacks]) {
    const t = (m ?? '').trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      chain.push(t)
    }
  }
  return chain
}

export type AttemptResult<T> = { ok: true; value: T } | { ok: false; error: Error }

/**
 * Δοκιμάζει τα μοντέλα με τη σειρά μέχρι να πετύχει ένα.
 *
 * Σε ολική αποτυχία πετάει το σφάλμα του ΠΡΩΤΟΥ μοντέλου. Αυτό είναι το
 * χρήσιμο («υψηλή ζήτηση»), όχι ένα παραπλανητικό «δεν βρέθηκε μοντέλο» από
 * κακορυθμισμένο εναλλακτικό.
 */
export async function tryModels<T>(
  models: string[],
  attempt: (model: string) => Promise<AttemptResult<T>>,
): Promise<T> {
  let firstError: Error | null = null

  for (let i = 0; i < models.length; i++) {
    const model = models[i]
    const r = await attempt(model)

    if (r.ok) {
      if (i > 0) {
        console.warn(`[ocr-fallback] πέτυχε με το εναλλακτικό «${model}» (το κύριο «${models[0]}» δεν ήταν διαθέσιμο)`)
      }
      return r.value
    }

    if (!firstError) firstError = r.error
    if (i < models.length - 1) {
      console.warn(`[ocr-fallback] «${model}» απέτυχε (${r.error.message.slice(0, 100)}); δοκιμάζω «${models[i + 1]}»`)
    }
  }

  throw firstError ?? new Error('Δεν δοκιμάστηκε κανένα μοντέλο.')
}
