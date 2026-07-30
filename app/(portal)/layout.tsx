import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getPortalScope } from '@/lib/portal/scope';
import { PortalShell } from './portal-shell';

/**
 * Το gate του portal.
 *
 * Ο proxy έχει ήδη μπλοκάρει τους non-customers, αλλά ο έλεγχος επαναλαμβάνεται
 * εδώ: defence in depth, για την περίπτωση που το matcher του proxy αλλάξει ή
 * κάποιο route ξεφύγει από αυτό.
 *
 * Το empty state όταν λείπει το scope ζει ΕΔΩ και όχι σε κάθε σελίδα — έτσι
 * καμία σελίδα δεν προλαβαίνει να τρέξει query χωρίς scope.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/portal');
  if (session.user.mustChangePassword) redirect('/auth/change-password');
  if (session.user.userType !== 'customer') redirect('/dashboard');

  const scope = await getPortalScope(session.user.id);

  return (
    <PortalShell
      companyName={scope?.companyName ?? null}
      user={{
        name: session.user.name ?? session.user.email,
        email: session.user.email,
        avatarUrl: session.user.image,
      }}
    >
      {scope ? (
        children
      ) : (
        <div className="mx-auto max-w-lg rounded-xl border border-fluent-neutral-20 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-fluent-neutral-90">
            Ο λογαριασμός σας δεν έχει συνδεθεί με εταιρία
          </h1>
          <p className="mt-2 text-sm text-fluent-neutral-60">
            Επικοινωνήστε με την ομάδα υποστήριξης για να ολοκληρωθεί η ρύθμιση του
            λογαριασμού σας.
          </p>
        </div>
      )}
    </PortalShell>
  );
}
