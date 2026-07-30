/**
 * Από bytes σε κείμενο.
 *
 * `unpdf` για PDF — καθαρό JavaScript, δουλεύει σε serverless· το `pdf-parse`
 * θέλει native εξαρτήσεις. `mammoth` για DOCX.
 *
 * Δεν κάνουμε OCR. Ένα σαρωμένο PDF βγάζει κενό κείμενο και σταματά εδώ με
 * ρητό μήνυμα — καλύτερα από μια ανάλυση που «πέτυχε» χωρίς να βρει τίποτα.
 */

export const MAX_FILE_BYTES = 20 * 1024 * 1024
/** Κάτω από αυτό δεν υπάρχει πρόταση να αναλυθεί — υπάρχει σφάλμα εξαγωγής. */
export const MIN_TEXT_CHARS = 200

export class ProposalExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProposalExtractionError'
  }
}

const PDF_TYPES = new Set(['application/pdf'])
const DOCX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export function isSupportedProposalFile(mimeType: string, fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return (
    PDF_TYPES.has(mimeType) ||
    DOCX_TYPES.has(mimeType) ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx')
  )
}

export type ExtractionResult = {
  text: string
  pageCount: number | null
}

export async function extractProposalText(
  bytes: Buffer | Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<ExtractionResult> {
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new ProposalExtractionError(
      `Το αρχείο ξεπερνά τα ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`,
    )
  }

  const lower = fileName.toLowerCase()
  const isPdf = PDF_TYPES.has(mimeType) || lower.endsWith('.pdf')
  const isDocx = DOCX_TYPES.has(mimeType) || lower.endsWith('.docx')

  if (!isPdf && !isDocx) {
    throw new ProposalExtractionError('Δεκτά είναι μόνο αρχεία PDF και DOCX.')
  }

  const result = isPdf ? await extractPdf(bytes) : await extractDocx(bytes)
  const text = normalizeWhitespace(result.text)

  if (text.length < MIN_TEXT_CHARS) {
    throw new ProposalExtractionError(
      isPdf
        ? 'Το PDF φαίνεται σαρωμένο — δεν βρέθηκε κείμενο μέσα του. Ανέβασε την πρόταση σε ψηφιακή μορφή (PDF με κείμενο ή DOCX).'
        : 'Το αρχείο DOCX δεν περιέχει αρκετό κείμενο για ανάλυση.',
    )
  }

  return { text, pageCount: result.pageCount }
}

async function extractPdf(bytes: Buffer | Uint8Array): Promise<ExtractionResult> {
  const { getDocumentProxy, extractText } = await import('unpdf')
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text, totalPages } = await extractText(pdf, { mergePages: true })
    return { text: Array.isArray(text) ? text.join('\n\n') : text, pageCount: totalPages ?? null }
  } catch (err) {
    throw new ProposalExtractionError(
      `Το PDF δεν διαβάστηκε: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

async function extractDocx(bytes: Buffer | Uint8Array): Promise<ExtractionResult> {
  const mammoth = await import('mammoth')
  try {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    const { value } = await mammoth.extractRawText({ buffer })
    return { text: value, pageCount: null }
  } catch (err) {
    throw new ProposalExtractionError(
      `Το DOCX δεν διαβάστηκε: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Τα PDF βγάζουν συχνά μονά γράμματα ανά γραμμή και σελίδες γεμάτες κενά. Το
 * καθάρισμα εδώ γλιτώνει tokens σε κάθε τεμάχιο — και σε 50 σελίδες αυτό δεν
 * είναι κοσμητικό.
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
