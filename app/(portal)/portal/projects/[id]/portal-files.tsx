import { FileRow, type PortalFile } from '@/components/portal/file-row'

export type { PortalFile }

/**
 * Τα αρχεία του έργου που έχει κοινοποιήσει η ομάδα, μαζί με ό,τι έχει στείλει
 * ο ίδιος ο πελάτης.
 *
 * Το φιλτράρισμα ορατότητας γίνεται στο query με `attachmentVisibilityFilter`,
 * ΟΧΙ εδώ — ένα εσωτερικό αρχείο δεν φεύγει ποτέ από τον server.
 *
 * Η γραμμή ζει πλέον στο `components/portal/file-row.tsx`, κοινή με το κεντρικό
 * αρχειοθέτιο του portal.
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
            <FileRow key={f.id} file={f} />
          ))}
        </div>
      )}
    </section>
  )
}
