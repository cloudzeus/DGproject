import { prisma } from '@/lib/prisma';
import { UserManagementClient } from '@/components/admin/user-management';

export default async function AdminUsersPage() {
  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        azureAdId: true,
        createdAt: true,
        departments: { select: { departmentId: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.department.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const initialUsers = users.map((u) => ({
    id: u.id,
    name: u.name ?? '',
    email: u.email,
    image: u.image,
    role: u.role,
    hasMicrosoftAccount: Boolean(u.azureAdId),
    createdAt: u.createdAt.toISOString(),
    departmentIds: u.departments.map((d) => d.departmentId),
  }));

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95 mb-6">
        Διαχείριση Χρηστών
      </h1>
      <UserManagementClient initialUsers={initialUsers} departments={departments} />
    </div>
  );
}
