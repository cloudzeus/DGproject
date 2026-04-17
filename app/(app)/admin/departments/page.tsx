import { prisma } from '@/lib/prisma';
import { DepartmentsClient } from './departments-client';

export default async function AdminDepartmentsPage() {
  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { members: true } } },
  });

  const initial = departments.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    color: d.color,
    memberCount: d._count.members,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95 mb-6">
        Διαχείριση Τμημάτων
      </h1>
      <DepartmentsClient initial={initial} />
    </div>
  );
}
