import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { SettingsClient } from './settings-client';
import { getMailgunSettings } from './mailgun-actions';
import type { MailgunSettingsView } from './mailgun-actions';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/settings');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, role: true },
  });
  if (!user) redirect('/auth/signin');

  const license = {
    serial: process.env.SOFTWARE_SERIAL ?? '—',
    vendor: process.env.SOFTWARE_COMPANY_VENTOR ?? process.env.SOFTWARE_COMPANY_VENDOR ?? '—',
    buyer: process.env.SOFTWARE_COMPANY_BUYER ?? '—',
    issuedOn: process.env.SOFTWARE_LICENSE_FROM ?? null,
    validUntil: process.env.SOFTWARE_LICENSE_TO ?? null,
  };

  const isAdmin = user.role === 'admin';
  let mailgunInitial: MailgunSettingsView | null = null;
  if (isAdmin) {
    try {
      mailgunInitial = await getMailgunSettings();
    } catch {
      mailgunInitial = null;
    }
  }

  return (
    <SettingsClient
      user={{
        id: user.id,
        name: user.name ?? '',
        email: user.email,
        image: user.image,
        role: user.role,
      }}
      license={license}
      isAdmin={isAdmin}
      mailgunInitial={mailgunInitial}
    />
  );
}
