import { auth } from '@/auth'
import { getPortalScope } from '@/lib/portal/scope'
import { listSharedFiles } from '@/lib/portal/files'
import { PortalFilesBrowser } from './files-browser'

export const dynamic = 'force-dynamic'

/**
 * Το κεντρικό αρχειοθέτιο: όλα τα κοινόχρηστα αρχεία, όλων των έργων, σε ένα σημείο.
 *
 * Λύνει το ότι μέχρι τώρα τα αρχεία ζούσαν θαμμένα σε μία καρτέλα ανά έργο — ο
 * πελάτης που θυμάται «μου στείλατε μια προσφορά» έπρεπε να μαντέψει σε ποιο
 * έργο ήταν.
 *
 * Όλες οι πύλες ορατότητας ζουν στο `listSharedFiles`.
 */
export default async function PortalFilesPage() {
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  const files = await listSharedFiles(scope)

  return (
    <div className="space-y-6">
      <header className="animate-fade-in">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
          Πύλη πελατών
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-fluent-neutral-90 sm:text-2xl">
          Αρχεία
        </h1>
        <p className="mt-1.5 text-sm text-fluent-neutral-70">
          {files.length > 0
            ? `${files.length} ${files.length === 1 ? 'αρχείο' : 'αρχεία'} από όλα τα έργα σας.`
            : 'Εδώ συγκεντρώνονται όλα τα αρχεία που ανταλλάσσουμε.'}
        </p>
      </header>

      <PortalFilesBrowser files={files} />
    </div>
  )
}
