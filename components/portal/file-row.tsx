/**
 * Μία γραμμή αρχείου, κοινή για την καρτέλα έργου και το κεντρικό αρχειοθέτιο.
 *
 * Εξήχθη από το `portal-files.tsx` όταν εμφανίστηκε η δεύτερη επιφάνεια: δύο
 * αντίγραφα της ίδιας γραμμής θα απέκλιναν στην πρώτη αλλαγή, και ο πελάτης θα
 * έβλεπε το ίδιο αρχείο με δύο μορφές ανάλογα με το πού στέκεται.
 *
 * ΔΕΝ φιλτράρει τίποτα. Το `attachmentVisibilityFilter` τρέχει στο query· ένα
 * εσωτερικό αρχείο δεν φτάνει ποτέ ως prop εδώ.
 */

export type PortalFile = {
  id: string
  name: string
  title: string | null
  size: number
  mimeType: string
  url: string
  createdAt: string
  uploadedByName: string
  /** Ανέβηκε από τον πελάτη (τον ίδιο ή συνάδελφο), όχι από την ομάδα. */
  fromUs: boolean
  /** Μόνο στο κεντρικό αρχειοθέτιο, όπου τα αρχεία έρχονται από πολλά έργα. */
  projectName?: string | null
}

const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' })

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Κατηγορία τύπου — οδηγεί και το εικονίδιο και τα φίλτρα του αρχειοθετίου,
 * ώστε «ό,τι βλέπω ως PDF» και «ό,τι φιλτράρω ως PDF» να μη διαφέρουν ποτέ.
 */
export function fileKind(mimeType: string): 'pdf' | 'image' | 'sheet' | 'doc' | 'other' {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv')
    return 'sheet'
  if (mimeType.includes('word') || mimeType.includes('document') || mimeType.startsWith('text/'))
    return 'doc'
  return 'other'
}

const KIND_COLOR: Record<string, string> = {
  pdf: '#C50F1F',
  image: '#8764B8',
  sheet: '#107C10',
  doc: '#0078D4',
  other: '#5C5C5C',
}

export function FileGlyph({ mimeType }: { mimeType: string }) {
  const tone = KIND_COLOR[fileKind(mimeType)]

  return (
    <svg
      className="h-8 w-8 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke={tone}
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5Z"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function FileRow({ file }: { file: PortalFile }) {
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      download={file.name}
      className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-fluent-neutral-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fluent-blue-500"
    >
      <FileGlyph mimeType={file.mimeType} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fluent-neutral-90">
          {file.title || file.name}
        </span>
        <span className="block truncate text-[11px] text-fluent-neutral-60">
          {humanSize(file.size)} · {fmtDate.format(new Date(file.createdAt))} ·{' '}
          {file.fromUs ? 'από εσάς' : file.uploadedByName}
          {file.projectName && ` · ${file.projectName}`}
        </span>
      </span>

      <svg
        className="h-4 w-4 shrink-0 text-fluent-neutral-40"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Λήψη</span>
    </a>
  )
}
