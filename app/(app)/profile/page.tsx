import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ProfileForm } from './profile-form';
import { MailboxPanel } from './mailbox-panel';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/profile');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      role: true,
      userType: true,
      azureAdId: true,
      mailConnection: { select: { scopes: true, createdAt: true } },
    },
  });

  if (!user) redirect('/auth/signin');

  // Mailbox feature is for internal users only and requires a Microsoft
  // identity (credential-only users have no Azure tokens to attach to).
  const canConnectMailbox = user.userType !== 'customer' && Boolean(user.azureAdId);

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95 mb-6">
        Το προφίλ μου
      </h1>
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
        <ProfileForm
          initial={{
            name: user.name ?? '',
            email: user.email,
            image: user.image,
            role: user.role,
            hasMicrosoftAccount: Boolean(user.azureAdId),
          }}
        />
      </div>
      {canConnectMailbox && (
        <MailboxPanel
          connected={Boolean(user.mailConnection)}
          scopes={user.mailConnection?.scopes ?? null}
          connectedAt={user.mailConnection?.createdAt ?? null}
        />
      )}
    </div>
  );
}
