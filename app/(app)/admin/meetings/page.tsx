import { prisma } from '@/lib/prisma';
import AdminMeetingsBrowser from './admin-meetings-browser';

export default async function AdminMeetingsPage() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return <AdminMeetingsBrowser projects={projects} />;
}
