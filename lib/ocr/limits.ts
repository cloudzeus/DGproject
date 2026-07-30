/**
 * Τύποι και όρια του OCR, χωρίς καμία εξάρτηση.
 *
 * Ξεχωριστά από το rasterize.ts επίτηδες: εκείνο είναι client-only και σέρνει
 * μαζί του το pdfjs. Ο server χρειάζεται τον τύπο της σελίδας και την οροφή —
 * όχι μια βιβλιοθήκη 3 MB που δεν μπορεί καν να φορτώσει.
 */

export type OcrImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface RasterizedPage {
  base64: string
  mimeType: OcrImageMimeType
  width: number
  height: number
}

/**
 * Οροφή σελίδων για OCR. Το damask κόβει στις 4 γιατί δουλεύει με τιμολόγια·
 * μια πρόταση έργου είναι άχρηστη μισή, οπότε το όριο είναι πολύ ψηλότερα και
 * λειτουργεί ως φρένο κόστους, όχι ως φίλτρο περιεχομένου.
 */
export const MAX_OCR_PAGES = 30

/** Κάτω από αυτό, το «επιλέξιμο κείμενο» είναι υπολείμματα, όχι περιεχόμενο. */
export const MIN_SELECTABLE_CHARS = 200

/**
 * True αν το αρχείο «μοιάζει» PDF. Ελέγχεται και η επέκταση: μερικοί scanners
 * και κάμερες δεν στέλνουν σωστό mimeType.
 */
export function isPdfFile(file: { type: string; name: string }): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}
