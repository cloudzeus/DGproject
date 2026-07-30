/**
 * Έλεγχος των εικόνων σελίδων που στέλνει ο browser.
 *
 * Αυτό είναι σύνορο εμπιστοσύνης: το περιεχόμενο έρχεται από τον πελάτη και
 * καταλήγει σε κλήσεις που κοστίζουν. Η στάση εδώ είναι «ό,τι δεν έχει σωστή
 * μορφή, πέφτει σιωπηλά» αντί για σφάλμα — μια χαλασμένη σελίδα δεν πρέπει να
 * ρίξει ολόκληρο το ανέβασμα, και ο μετρητής στο τέλος δείχνει τι πραγματικά
 * διαβάστηκε.
 *
 * Καθαρή συνάρτηση — ελέγχεται χωρίς αίτημα και χωρίς δίκτυο.
 */

import { MAX_OCR_PAGES, type RasterizedPage } from './limits'

/** Οροφή για το JSON των εικόνων. 30 σελίδες webp χωράνε άνετα μέσα σε αυτό. */
export const MAX_OCR_PAYLOAD_CHARS = 40 * 1024 * 1024

const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg'])

export function parseOcrPages(raw: unknown, maxPages = MAX_OCR_PAGES): RasterizedPage[] {
  if (typeof raw !== 'string' || raw.length === 0) return []
  // Ο έλεγχος μεγέθους ΠΡΙΝ το JSON.parse: ένα payload 200 MB δεν πρέπει καν
  // να φτάσει στον parser.
  if (raw.length > MAX_OCR_PAYLOAD_CHARS) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const pages: RasterizedPage[] = []

  for (const candidate of parsed.slice(0, maxPages)) {
    if (typeof candidate !== 'object' || candidate === null) continue

    const p = candidate as Partial<RasterizedPage>
    if (typeof p.base64 !== 'string' || p.base64.length === 0) continue
    if (typeof p.mimeType !== 'string' || !ALLOWED_MIME.has(p.mimeType)) continue

    pages.push({
      base64: p.base64,
      mimeType: p.mimeType as RasterizedPage['mimeType'],
      width: Number(p.width) || 0,
      height: Number(p.height) || 0,
    })
  }

  return pages
}
