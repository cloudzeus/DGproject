import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getPortalScope } from '@/lib/portal/scope'
import { getSharedMeeting } from '@/lib/portal/meetings'
import { MomView } from '@/components/portal/mom-view'

export const dynamic = 'force-dynamic'

function duration(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} λεπτά`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h}ω ${rest}′` : `${h} ${h === 1 ? 'ώρα' : 'ώρες'}`
}

export default async function PortalMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  // `getSharedMeeting` δεν διακρίνει «δεν υπάρχει» από «δεν επιτρέπεται», και το
  // 404 διατηρεί αυτή την ασάφεια προς τα έξω: διαφορετικές απαντήσεις θα
  // επιβεβαίωναν την ύπαρξη σύσκεψης που ο πελάτης δεν δικαιούται να ξέρει.
  const meeting = await getSharedMeeting(scope, id)
  if (!meeting) notFound()

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-fluent-neutral-60">
        <Link href="/portal/meetings" className="hover:text-fluent-blue-600 hover:underline">
          Πρακτικά
        </Link>
        <span aria-hidden>›</span>
        <Link
          href={`/portal/projects/${meeting.projectId}`}
          className="truncate hover:text-fluent-blue-600 hover:underline"
        >
          {meeting.projectName}
        </Link>
      </nav>

      <header className="animate-fade-in">
        <h1 className="font-display text-xl font-semibold leading-tight tracking-tight text-fluent-neutral-90 sm:text-2xl">
          {meeting.subject}
        </h1>
        <p className="mt-1.5 text-sm text-fluent-neutral-70">
          {new Intl.DateTimeFormat('el-GR', {
            dateStyle: 'full',
            timeStyle: 'short',
          }).format(new Date(meeting.startedAt))}{' '}
          · {duration(meeting.durationSec)}
        </p>
      </header>

      <MomView meeting={meeting} />

      <p className="border-t border-fluent-neutral-10 pt-4 text-[11px] leading-relaxed text-fluent-neutral-60">
        Τα πρακτικά συντάσσονται από την ομάδα μετά από κάθε σύσκεψη. Αν κάτι λείπει ή
        χρειάζεται διόρθωση,{' '}
        <Link href="/portal/tickets" className="text-fluent-blue-600 hover:underline">
          ανοίξτε ένα αίτημα
        </Link>
        .
      </p>
    </div>
  )
}
