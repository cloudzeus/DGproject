/**
 * Μαζική εισαγωγή πελατών από το SoftOne στο Company model.
 *
 * Στρατηγική δύο σταδίων (ίδιο idiom με το damask src/lib/s1-sync.ts):
 *   1. `GetTable` (TABLE, FIELDS, FILTER) — απευθείας query, προτιμώμενο.
 *   2. Fallback `getBrowserInfo` → `getBrowserData` (paginated).
 *
 * ΠΡΟΣΟΧΗ στο σχήμα απόκρισης — επιβεβαιωμένο ζωντανά στο tenant `dgsoft`:
 * το `GetTable` επιστρέφει τις γραμμές στο κλειδί **`data`** (όχι `rows`), και
 * κάθε γραμμή είναι **θεσιακή**: τα κλειδιά είναι οι δείκτες ως strings
 * ("0", "1", …) με τη σειρά που ζητήθηκαν τα FIELDS, ΟΧΙ τα ονόματα πεδίων.
 *
 * Upsert με κλειδί το TRDR. Κανόνας ενημέρωσης (από damask partner-upsert):
 * ΠΟΤΕ δεν αντικαθιστούμε υπάρχουσα τιμή με κενή — εταιρία εμπλουτισμένη από την
 * ΑΑΔΕ δεν πρέπει να ισοπεδώνεται από αραιή γραμμή του ERP.
 */
import { randomUUID } from 'crypto'
import { s1 } from '@/lib/softone'
import { prisma } from '@/lib/prisma'
import { normalizeAfm } from './afm'

/** Η σειρά εδώ ΚΑΘΟΡΙΖΕΙ τη θεσιακή χαρτογράφηση του GetTable. Μην την αλλάξεις. */
const FIELDS = [
  'TRDR', 'SODTYPE', 'CODE', 'NAME', 'AFM', 'IRSDATA', 'JOBTYPETRD',
  'ADDRESS', 'ZIP', 'DISTRICT', 'CITY', 'COUNTRY',
  'PHONE01', 'PHONE02', 'FAX', 'EMAIL', 'WEBPAGE',
  'ISACTIVE', 'REMARKS', 'UPDDATE',
] as const

/** SODTYPE 13 = Πελάτης. */
const SODTYPE_CUSTOMER = 13

export type ImportResult = {
  fetched: number
  created: number
  updated: number
  skipped: number
  strategy: 'GetTable' | 'getBrowserData'
}

type Row = Record<string, unknown>

function str(v: unknown): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t ? t : null
}

function int(v: unknown): number | null {
  const t = str(v)
  if (t === null) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function date(v: unknown): Date | null {
  const t = str(v)
  if (!t) return null
  const d = new Date(t.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Μετατρέπει μια θεσιακή γραμμή του GetTable σε αντικείμενο με ονόματα πεδίων. */
function fromPositional(row: Row): Row {
  const out: Row = {}
  FIELDS.forEach((name, i) => { out[name] = row[String(i)] })
  return out
}

async function fetchRows(): Promise<{ rows: Row[]; strategy: ImportResult['strategy'] }> {
  // 1. GetTable — προτιμώμενο.
  const table = await s1('GetTable', {
    TABLE: 'TRDR',
    FIELDS: FIELDS.join(','),
    FILTER: `SODTYPE=${SODTYPE_CUSTOMER}`,
  })
  const tableRows = Array.isArray(table?.data) ? (table.data as Row[]) : null
  if (table?.success && tableRows?.length) {
    // Οι γραμμές είναι θεσιακές· αν κάποιο tenant επιστρέψει ονόματα, τα δεχόμαστε κι αυτά.
    const positional = Object.prototype.hasOwnProperty.call(tableRows[0], '0')
    return {
      rows: positional ? tableRows.map(fromPositional) : tableRows,
      strategy: 'GetTable',
    }
  }

  // 2. Fallback: getBrowserInfo → getBrowserData (paginated).
  const info = await s1('getBrowserInfo', {
    object: 'CUSTOMER',
    LIST: '001',
    FILTERS: 'CUSTOMER.ISACTIVE=1',
  })
  if (!info?.success || !info.reqID) {
    throw new Error(
      `SoftOne: ούτε GetTable ούτε getBrowserInfo επέστρεψαν δεδομένα (${info?.error ?? table?.error ?? 'άγνωστο'})`,
    )
  }

  const meta = (info.fields ?? []) as { name: string }[]
  const total = Number(info.totalcount ?? 0)
  const PAGE = 500
  const rows: Row[] = []

  for (let start = 0; start < total; start += PAGE) {
    const page = await s1('getBrowserData', { reqID: info.reqID, START: start, LIMIT: PAGE })
    if (!page?.success) throw new Error(`SoftOne getBrowserData απέτυχε: ${page?.error ?? 'άγνωστο'}`)
    for (const raw of (page.rows ?? page.data ?? []) as unknown[]) {
      if (Array.isArray(raw)) {
        const obj: Row = {}
        meta.forEach((f, i) => { obj[f.name.split('.').pop() ?? f.name] = raw[i] })
        rows.push(obj)
      } else if (raw && typeof raw === 'object') {
        rows.push(raw as Row)
      }
    }
  }
  return { rows, strategy: 'getBrowserData' }
}

/** Στήλες του batched upsert. Η σειρά δεσμεύει τα placeholders. */
const UPSERT_COLS = [
  'id', 'TRDR', 'SODTYPE', 'CODE', 'NAME', 'AFM', 'IRSDATA', 'JOBTYPETRD',
  'ADDRESS', 'ZIP', 'DISTRICT', 'CITY', 'COUNTRY',
  'PHONE01', 'PHONE02', 'FAX', 'EMAIL', 'WEBPAGE',
  'ISACTIVE', 'REMARKS', 'UPDDATE', 'syncedAt', 'createdAt', 'updatedAt',
] as const

/** Στήλες κειμένου: κρατάμε την υπάρχουσα τιμή όταν το ERP στέλνει κενό/NULL. */
const KEEP_IF_BLANK = [
  'CODE', 'AFM', 'IRSDATA', 'JOBTYPETRD', 'ADDRESS', 'ZIP', 'DISTRICT', 'CITY',
  'PHONE01', 'PHONE02', 'FAX', 'EMAIL', 'WEBPAGE', 'REMARKS',
] as const

/** Στήλες μη-κειμένου: κρατάμε την υπάρχουσα τιμή μόνο όταν το ERP στέλνει NULL. */
const KEEP_IF_NULL = ['COUNTRY', 'UPDDATE'] as const

/**
 * Ένα `INSERT … ON DUPLICATE KEY UPDATE` ανά παρτίδα, αντί για ένα round trip
 * ανά γραμμή. Το πρώτο τρέξιμο (3924 νέες) γινόταν γρήγορα με createMany, αλλά
 * το δεύτερο (3924 ενημερώσεις) έκανε 3924 διαδοχικά updates σε remote MySQL και
 * ξεπερνούσε τα 10 λεπτά — απαράδεκτο για action που καλείται από το UI.
 *
 * Σύνταξη `AS new` (MySQL 8.0.19+, εδώ 8.0.46) — η παλιά `VALUES()` είναι deprecated.
 */
function buildUpsertSql(rowCount: number): string {
  const placeholders = Array.from({ length: rowCount }, () => `(${UPSERT_COLS.map(() => '?').join(',')})`).join(',')

  const assignments = [
    // Επικυρωμένα μη-κενά — γράφονται πάντα.
    'NAME = new.NAME',
    'SODTYPE = new.SODTYPE',
    'ISACTIVE = new.ISACTIVE',
    'syncedAt = new.syncedAt',
    'updatedAt = new.updatedAt',
    ...KEEP_IF_BLANK.map((c) => `${c} = COALESCE(NULLIF(new.${c}, ''), Company.${c})`),
    ...KEEP_IF_NULL.map((c) => `${c} = COALESCE(new.${c}, Company.${c})`),
  ].join(', ')

  return `INSERT INTO \`Company\` (${UPSERT_COLS.map((c) => `\`${c}\``).join(',')})
          VALUES ${placeholders}
          AS new
          ON DUPLICATE KEY UPDATE ${assignments}`
}

export async function importCompaniesFromSoftOne(
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const { rows, strategy } = await fetchRows()
  const result: ImportResult = { fetched: rows.length, created: 0, updated: 0, skipped: 0, strategy }

  const existing = new Set(
    (await prisma.company.findMany({ where: { TRDR: { not: null } }, select: { TRDR: true } }))
      .map((c) => c.TRDR as number),
  )

  const now = new Date()
  const batch: unknown[][] = []

  for (const raw of rows) {
    const TRDR = int(raw.TRDR)
    const NAME = str(raw.NAME)
    if (!TRDR || !NAME) { result.skipped++; continue }

    const afm = str(raw.AFM)
    if (existing.has(TRDR)) result.updated++
    else { result.created++; existing.add(TRDR) }

    batch.push([
      // `id` αγνοείται όταν η γραμμή υπάρχει ήδη (σύγκρουση στο unique TRDR).
      randomUUID(),
      TRDR,
      int(raw.SODTYPE) ?? SODTYPE_CUSTOMER,
      str(raw.CODE),
      NAME,
      afm ? normalizeAfm(afm) || null : null,
      str(raw.IRSDATA),
      str(raw.JOBTYPETRD),
      str(raw.ADDRESS),
      str(raw.ZIP),
      str(raw.DISTRICT),
      str(raw.CITY),
      int(raw.COUNTRY),
      str(raw.PHONE01),
      str(raw.PHONE02),
      str(raw.FAX),
      str(raw.EMAIL),
      str(raw.WEBPAGE),
      int(raw.ISACTIVE) ?? 1,
      str(raw.REMARKS),
      date(raw.UPDDATE),
      now,
      now,
      now,
    ])
  }

  // 24 στήλες × 500 γραμμές = 12.000 placeholders, άνετα κάτω από το όριο 65.535.
  const CHUNK = 500
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK)
    await prisma.$executeRawUnsafe(buildUpsertSql(slice.length), ...slice.flat())
    onProgress?.(Math.min(i + CHUNK, batch.length), batch.length)
  }

  return result
}
