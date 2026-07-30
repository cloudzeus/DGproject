/**
 * fetch με επανάληψη για παροδικές αστοχίες ανοδικών API.
 *
 * Προσαρμογή από το damask (src/lib/ocr/fetch-retry.ts). Το Gemini επιστρέφει
 * 503 UNAVAILABLE όταν το συγκεκριμένο μοντέλο έχει αιχμή ζήτησης· χωρίς
 * backoff, μια ολόκληρη ανάλυση 30 σελίδων πέφτει από ένα τρεμόπαιγμα.
 *
 * Επαναλαμβάνει ΜΟΝΟ τις παροδικές καταστάσεις. Ένα 400 ή 401 δεν γίνεται
 * καλύτερο με αναμονή — γίνεται μόνο πιο αργό.
 */

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status)
}

/**
 * Εκθετική υποχώρηση για την προσπάθεια `attempt` (από 0): base * 2^attempt,
 * συν τυχαία διασπορά έως το μισό του βήματος ώστε πολλές παράλληλες κλήσεις
 * να μην ξαναχτυπήσουν όλες την ίδια στιγμή.
 *
 * Το `rand` είναι παράμετρος για να ελέγχεται ντετερμινιστικά.
 */
export function nextDelayMs(attempt: number, baseMs: number, rand: () => number = Math.random): number {
  const step = baseMs * 2 ** attempt
  const jitter = Math.floor(rand() * (baseMs / 2))
  return step + jitter
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface RetryOpts {
  attempts?: number
  baseMs?: number
  /** Σύντομο πλαίσιο για τα διαγνωστικά μηνύματα (π.χ. το όνομα μοντέλου). */
  label?: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  rand?: () => number
}

/**
 * Επιστρέφει την τελική `Response` — ο καλών εξετάζει ο ίδιος το `res.ok`.
 * Σφάλματα δικτύου ξαναπετιούνται μόνο μετά την τελευταία προσπάθεια.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOpts = {},
): Promise<Response> {
  const attempts = opts.attempts ?? 4
  const baseMs = opts.baseMs ?? 600
  const doFetch = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? defaultSleep
  const rand = opts.rand ?? Math.random
  const tag = opts.label ? `[ocr-retry ${opts.label}]` : '[ocr-retry]'

  let lastRes: Response | null = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    const isLast = attempt === attempts - 1
    let res: Response

    try {
      res = await doFetch(url, init)
    } catch (err) {
      if (isLast) throw err
      const delay = nextDelayMs(attempt, baseMs, rand)
      console.warn(`${tag} σφάλμα δικτύου, προσπάθεια ${attempt + 1}/${attempts}, ξανά σε ${delay}ms`)
      await sleep(delay)
      continue
    }

    if (!isRetryableStatus(res.status) || isLast) return res

    lastRes = res
    const delay = nextDelayMs(attempt, baseMs, rand)
    console.warn(`${tag} κατάσταση ${res.status}, προσπάθεια ${attempt + 1}/${attempts}, ξανά σε ${delay}ms`)
    // Άδειασμα του σώματος πριν την επανάληψη, ώστε να ελευθερωθεί το socket.
    await res.text().catch(() => {})
    await sleep(delay)
  }

  return lastRes ?? new Response('retry exhausted', { status: 503 })
}
