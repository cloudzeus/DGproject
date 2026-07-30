import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';
import { PortalContactsClient } from './portal-contacts-client';

export const dynamic = 'force-dynamic';

export default async function PortalContacts() {
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  if (!scope) return null;

  const contacts = await prisma.contact.findMany({
    where: { companyId: scope.companyId },
    orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    select: {
      id: true, name: true, position: true, email: true,
      phone: true, mobile: true, isPrimary: true, userId: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-fluent-neutral-90">
        Οι επαφές μας
      </h1>
      <p className="mt-1 text-sm text-fluent-neutral-70">
        {scope.companyName} — ποιος χειρίζεται τι από τη δική σας πλευρά. Η ομάδα μας βλέπει
        αυτή τη λίστα και ξέρει σε ποιον να απευθυνθεί.
      </p>

      <PortalContactsClient
        contacts={contacts.map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position,
          email: c.email,
          phone: c.phone,
          mobile: c.mobile,
          isPrimary: c.isPrimary,
          hasLogin: c.userId !== null,
        }))}
      />
    </div>
  );
}
