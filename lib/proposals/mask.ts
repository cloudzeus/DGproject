/**
 * Απόκρυψη προσωπικών δεδομένων πριν η πρόταση φύγει προς το DeepSeek.
 *
 * Το DeepSeek φιλοξενείται στην Κίνα — ίδια πολιτική με το triage των tickets
 * (lib/tickets/mask.ts) και την ανάλυση συσκέψεων (lib/llm/pseudonymize.ts):
 * ό,τι ταυτοποιεί άνθρωπο ή εταιρεία δεν φεύγει ποτέ.
 *
 * Τα ποσά ΔΕΝ κρύβονται. Δεν είναι προσωπικά δεδομένα, και βοηθούν το μοντέλο
 * να εκτιμήσει το μέγεθος της δουλειάς.
 *
 * Καθαρές συναρτήσεις — ελέγχονται χωρίς βάση και χωρίς δίκτυο.
 */

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/g
/** IBAN: δύο γράμματα χώρας, δύο ψηφία ελέγχου, μετά 11–30 αλφαριθμητικά. */
const IBAN = /\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4}\b/g
/** Υποψήφιο τηλέφωνο: επικυρώνεται μετά με μέτρημα ψηφίων. */
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{7,}\d/g
/**
 * ΑΦΜ: εννιά ψηφία μόνα τους.
 *
 * Οι φύλακες αποκλείουν αριθμό μέσα σε ποσό («45.123456789,00»), αλλά ΟΧΙ
 * τελεία ή κόμμα στίξης μετά — «ΑΦΜ: 123456789, ΔΟΥ Παλλήνης» είναι η
 * συνηθέστερη μορφή σε πρόταση, και ένας φύλακας που την έκοβε άφηνε το ΑΦΜ
 * να φύγει αμάσκαρο.
 */
const AFM = /(?<!\d)(?<!\d[.,])\d{9}(?!\d)(?![.,]\d)/g

/**
 * Πραγματικό τηλέφωνο έχει 10–15 ψηφία. Ο έλεγχος αυτός χωρίζει το
 * «210 1234567» από το «2026 - 2027», που το σκέτο μοτίβο θα έκρυβε κι αυτό —
 * και μια πρόταση είναι γεμάτη χρονολογίες.
 */
function isPhoneLike(match: string): boolean {
  const digits = match.replace(/\D/g, '').length
  return digits >= 10 && digits <= 15
}

/** Κρύβει email, IBAN, τηλέφωνα και ΑΦΜ. Η σειρά μετράει: το IBAN πρώτο. */
export function maskProposalPII(text: string): string {
  return text
    .replace(IBAN, '[IBAN]')
    .replace(EMAIL, '[email]')
    .replace(PHONE_CANDIDATE, (m) => (isPhoneLike(m) ? '[τηλέφωνο]' : m))
    .replace(AFM, '[ΑΦΜ]')
}

export type NameMap = Map<string, string>

/**
 * Χτίζει αντιστοίχιση πραγματικών ονομάτων προς ψευδώνυμα.
 *
 * Τα μακρύτερα πρώτα: αλλιώς το «ΔΗΜΟΣ» μέσα στο «ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ»
 * αντικαθίσταται πρώτο και αφήνει πίσω του «ΟΝΟΜΑ_1 ΘΕΣΣΑΛΟΝΙΚΗΣ».
 */
export function buildNameMap(names: string[]): NameMap {
  const map: NameMap = new Map()
  const unique = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3)),
  ).sort((a, b) => b.length - a.length)

  unique.forEach((name, i) => {
    map.set(name, `ΟΝΟΜΑ_${i + 1}`)
  })
  return map
}

export function pseudonymizeNames(text: string, map: NameMap): string {
  let out = text
  for (const [real, token] of map) {
    out = out.replace(new RegExp(escapeRegExp(real), 'gi'), token)
  }
  return out
}

/** Επαναφέρει τα πραγματικά ονόματα στην απάντηση του μοντέλου. */
export function restoreNames(text: string, map: NameMap): string {
  let out = text
  for (const [real, token] of map) {
    out = out.replace(new RegExp(escapeRegExp(token), 'g'), real)
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
