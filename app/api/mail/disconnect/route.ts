import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
  // Customers don't have a mail connection, but no harm in letting the
  // delete-if-exists go through.
  await prisma.userMailConnection.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
