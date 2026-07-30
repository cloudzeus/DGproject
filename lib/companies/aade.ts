/**
 * Αναζήτηση στοιχείων επιχείρησης από ΑΦΜ μέσω της δικής μας υπηρεσίας
 * vat.wwa.gr/afm2info — ΟΧΙ το δημόσιο GSIS SOAP RgWsPublic2, ΟΧΙ credentials.
 *
 *   POST https://vat.wwa.gr/afm2info   body: { afm: "094019245" }
 *   → { basic_rec: {...}, firm_act_tab: { item: [] | {} } }
 *
 * Σε αντίθεση με το SoftOne, λύνει ΟΠΟΙΟΔΗΠΟΤΕ ελληνικό ΑΦΜ — και όχι μόνο
 * εταιρίες που υπάρχουν ήδη στο ERP, που είναι ακριβώς η περίπτωση όπου
 * χρειάζεται βοήθεια η καταχώριση.
 */
import { normalizeAfm, isValidAfm } from './afm'
import { mapAadeResponse, type AadeMapped, type AadeRawResponse } from './aade-map'

const AADE_ENDPOINT = 'https://vat.wwa.gr/afm2info'
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Σφάλμα επικοινωνίας/εγκυρότητας. ΔΕΝ σημαίνει «δεν βρέθηκε» — αυτό είναι
 * `null` return. Τα δύο δεν πρέπει να συγχέονται: το πρώτο είναι πρόβλημα, το
 * δεύτερο φυσιολογική ροή που οδηγεί σε χειροκίνητη καταχώριση.
 */
export class AadeLookupError extends Error {}

export async function aadeLookup(afmInput: string): Promise<AadeMapped | null> {
  const afm = normalizeAfm(afmInput)
  if (!isValidAfm(afm)) {
    throw new AadeLookupError('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
  }

  let raw: AadeRawResponse
  try {
    const res = await fetch(AADE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ afm }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new AadeLookupError(`Η υπηρεσία ΑΑΔΕ επέστρεψε σφάλμα HTTP ${res.status}.`)
    }
    raw = (await res.json()) as AadeRawResponse
  } catch (err) {
    if (err instanceof AadeLookupError) throw err
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AadeLookupError('Η υπηρεσία ΑΑΔΕ δεν απάντησε έγκαιρα (10s). Δοκίμασε ξανά.')
    }
    throw new AadeLookupError('Αδυναμία σύνδεσης με την υπηρεσία ΑΑΔΕ. Δοκίμασε ξανά σε λίγο.')
  }

  return mapAadeResponse(raw)
}
