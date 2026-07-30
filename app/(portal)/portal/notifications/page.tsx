import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'
import { PortalNotificationList } from './notification-list'

export const dynamic = 'force-dynamic'

/**
 * Πλήρες ιστορικό ειδοποιήσεων.
 *
 * Το `getPortalScope` καλείται ακόμα κι αν το query δεν το χρησιμοποιεί: είναι ο
 * έλεγχος «είσαι πελάτης με εταιρία;» που κρατά τη σελίδα κλειστή για όποιον δεν
 * ανήκει στο portal. Το ίδιο το query κλειδώνει στο `userId` — μια ειδοποίηση
 * ανήκει σε πρόσωπο, όχι σε εταιρία, οπότε δεν φιλτράρεται ανά έργο.
 */
export default async function PortalNotificationsPage() {
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  const rows = await prisma.notification.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <div className="space-y-6">
      <header className="animate-fade-in">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
          Πύλη πελατών
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-fluent-neutral-90 sm:text-2xl">
          Ειδοποιήσεις
        </h1>
        <p className="mt-1.5 text-sm text-fluent-neutral-70">
          Κάθε εξέλιξη στα έργα και τα αιτήματά σας, με τη σειρά που συνέβη.
        </p>
      </header>

      <PortalNotificationList
        items={rows.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          read: n.read,
          link: n.link,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
