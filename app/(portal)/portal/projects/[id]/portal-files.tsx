export type PortalFile = {
  id: string;
  name: string;
  title: string | null;
  size: number;
  mimeType: string;
  url: string;
  createdAt: string;
  uploadedByName: string;
  /** Ανέβηκε από τον πελάτη (τον ίδιο ή συνάδελφο), όχι από την ομάδα. */
  fromUs: boolean;
};

const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' });

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Εικονίδιο τύπου — inline SVG γιατί αυτό είναι server component. */
function FileGlyph({ mimeType }: { mimeType: string }) {
  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');
  const tone = isPdf ? '#C50F1F' : isImage ? '#8764B8' : '#5C5C5C';

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
  );
}

/**
 * Τα αρχεία του έργου που έχει κοινοποιήσει η ομάδα, μαζί με ό,τι έχει στείλει
 * ο ίδιος ο πελάτης.
 *
 * Το φιλτράρισμα ορατότητας γίνεται στο query με `attachmentVisibilityFilter`,
 * ΟΧΙ εδώ — ένα εσωτερικό αρχείο δεν φεύγει ποτέ από τον server.
 */
export function PortalFiles({ files }: { files: PortalFile[] }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-base font-semibold text-fluent-neutral-90">
        Αρχεία έργου
      </h2>

      {files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-8 text-center">
          <p className="text-sm text-fluent-neutral-60">
            Δεν έχουν κοινοποιηθεί αρχεία ακόμα.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
          {files.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              download={f.name}
              className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-fluent-neutral-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fluent-blue-500"
            >
              <FileGlyph mimeType={f.mimeType} />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fluent-neutral-90">
                  {f.title || f.name}
                </span>
                <span className="block text-[11px] text-fluent-neutral-60">
                  {humanSize(f.size)} · {fmtDate.format(new Date(f.createdAt))} ·{' '}
                  {f.fromUs ? 'από εσάς' : f.uploadedByName}
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
          ))}
        </div>
      )}
    </section>
  );
}
