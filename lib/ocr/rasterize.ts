/**
 * PDF → εικόνες, ΑΠΟΚΛΕΙΣΤΙΚΑ στον browser.
 *
 * Προσαρμογή από το damask (src/lib/ocr/rasterize.ts). Η επιλογή να τρέχει
 * client-side δεν είναι στιλιστική: η rasterization στον server θα απαιτούσε
 * native εξαρτήσεις (`canvas`, `sharp`, poppler) που πρέπει να χτίζονται ανά
 * πλατφόρμα και σπάνε σε κάθε deploy. Ο browser έχει ήδη canvas.
 *
 * Το επιλέξιμο κείμενο μαζεύεται από ΟΛΕΣ τις σελίδες όσο τρέχει η
 * rasterization — είναι φθηνό, και είναι αυτό που απαντά στο «χρειάζεται καν
 * OCR;» πριν ξοδευτεί ένα ευρώ σε κλήσεις όρασης.
 *
 * Το pdfjs-dist φορτώνεται δυναμικά ώστε να μη φουσκώνει το αρχικό bundle:
 * οι περισσότεροι χρήστες δεν ανεβάζουν ποτέ σαρωμένη πρόταση.
 */

export type OcrImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface RasterizedPage {
  base64: string
  mimeType: OcrImageMimeType
  width: number
  height: number
}

export interface RasterizeResult {
  pages: RasterizedPage[]
  /** Επιλέξιμο κείμενο από ΟΛΕΣ τις σελίδες — null αν το PDF είναι πλήρως σαρωμένο. */
  text: string | null
  pageCount: number
  /** true όταν το PDF είχε περισσότερες σελίδες από το όριο. */
  truncated: boolean
}

/**
 * Οροφή σελίδων για OCR. Το damask κόβει στις 4 γιατί δουλεύει με τιμολόγια·
 * μια πρόταση έργου είναι άχρηστη μισή, οπότε το όριο είναι πολύ ψηλότερα και
 * λειτουργεί ως φρένο κόστους, όχι ως φίλτρο περιεχομένου.
 */
export const MAX_OCR_PAGES = 30

const DEFAULT_SCALE = 1.8
const DEFAULT_MIME: OcrImageMimeType = 'image/webp'
const DEFAULT_QUALITY = 0.82
/** Κάτω από αυτό, το «επιλέξιμο κείμενο» είναι υπολείμματα, όχι περιεχόμενο. */
const MIN_SELECTABLE_CHARS = 200

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const comma = dataUrl.indexOf(',')
      resolve(comma === -1 ? dataUrl : dataUrl.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Η ανάγνωση του αρχείου απέτυχε.'))
    reader.readAsDataURL(blob)
  })
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type AnyCanvasContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

function createCanvas(width: number, height: number): { canvas: AnyCanvas; offscreen: boolean } {
  if (typeof OffscreenCanvas !== 'undefined') {
    return { canvas: new OffscreenCanvas(width, height), offscreen: true }
  }
  const el = document.createElement('canvas')
  el.width = width
  el.height = height
  return { canvas: el, offscreen: false }
}

async function canvasToBlob(
  canvas: AnyCanvas,
  offscreen: boolean,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  if (offscreen) return (canvas as OffscreenCanvas).convertToBlob({ type: mimeType, quality })
  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Η μετατροπή του canvas απέτυχε.'))),
      mimeType,
      quality,
    )
  })
}

function textItemString(item: unknown): string {
  return typeof item === 'object' && item !== null && 'str' in item && typeof (item as { str: unknown }).str === 'string'
    ? (item as { str: string }).str
    : ''
}

let workerConfigured = false

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    workerConfigured = true
  }
  return pdfjs
}

export interface PdfProbe {
  pageCount: number
  /** Το PDF έχει επιλέξιμο κείμενο — δεν χρειάζεται OCR. */
  hasText: boolean
}

/**
 * Γρήγορος έλεγχος πριν το ανέβασμα: πόσες σελίδες, και έχει κείμενο;
 *
 * Δεν ζωγραφίζει τίποτα — μόνο διαβάζει. Έτσι το modal μπορεί να πει «47
 * σελίδες, σαρωμένες» τη στιγμή που ο χρήστης διαλέγει το αρχείο, χωρίς να
 * ξοδέψει δευτερόλεπτα rasterization σε ένα PDF που τελικά δεν το χρειάζεται.
 */
export async function probePdf(file: File): Promise<PdfProbe> {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await loadingTask.promise

  try {
    let chars = 0
    for (let i = 1; i <= doc.numPages && chars < MIN_SELECTABLE_CHARS; i++) {
      const page = await doc.getPage(i)
      try {
        const tc = await page.getTextContent()
        chars += tc.items.map(textItemString).join(' ').trim().length
      } catch {
        // Σελίδα χωρίς εξαγώγιμο κείμενο — μετράει ως μηδέν.
      }
    }
    return { pageCount: doc.numPages, hasText: chars >= MIN_SELECTABLE_CHARS }
  } finally {
    await loadingTask.destroy().catch(() => {})
  }
}

export interface RasterizeOptions {
  maxPages?: number
  scale?: number
  mimeType?: 'image/webp' | 'image/png'
  quality?: number
  /** Καλείται μετά από κάθε σελίδα — για τη μπάρα προόδου του modal. */
  onProgress?: (done: number, total: number) => void
}

export async function rasterizePdf(file: File, opts: RasterizeOptions = {}): Promise<RasterizeResult> {
  const maxPages = opts.maxPages ?? MAX_OCR_PAGES
  const scale = opts.scale ?? DEFAULT_SCALE
  const mimeType = opts.mimeType ?? DEFAULT_MIME
  const quality = opts.quality ?? DEFAULT_QUALITY

  const pdfjs = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  // Κρατάμε το loadingTask, όχι μόνο το document: το destroy() που ελευθερώνει
  // τους πόρους του worker ζει εκεί.
  const loadingTask = pdfjs.getDocument({ data: buffer })
  const doc = await loadingTask.promise

  const pageCount = doc.numPages
  const pagesToRender = Math.min(pageCount, maxPages)
  const pages: RasterizedPage[] = []
  const textChunks: string[] = []

  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)

      try {
        const tc = await page.getTextContent()
        const pageText = tc.items.map(textItemString).join(' ')
        if (pageText.trim()) textChunks.push(pageText)
      } catch {
        // Σελίδα χωρίς εξαγώγιμο κείμενο — την καλύπτει η διαδρομή όρασης.
      }

      if (i > pagesToRender) continue

      const viewport = page.getViewport({ scale })
      const { canvas, offscreen } = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const ctx = canvas.getContext('2d') as AnyCanvasContext | null
      if (!ctx) throw new Error('Ο browser δεν δίνει canvas 2D context.')

      await page.render({
        canvasContext: ctx as CanvasRenderingContext2D,
        viewport,
        canvas: canvas as HTMLCanvasElement,
      }).promise

      const blob = await canvasToBlob(canvas, offscreen, mimeType, quality)
      pages.push({
        base64: await blobToBase64(blob),
        mimeType,
        width: canvas.width,
        height: canvas.height,
      })
      opts.onProgress?.(pages.length, pagesToRender)
    }
  } finally {
    await loadingTask.destroy().catch(() => {})
  }

  const text = textChunks.join('\n').replace(/[ \t]+/g, ' ').trim()

  return {
    pages,
    text: text.length >= MIN_SELECTABLE_CHARS ? text : null,
    pageCount,
    truncated: pageCount > maxPages,
  }
}
