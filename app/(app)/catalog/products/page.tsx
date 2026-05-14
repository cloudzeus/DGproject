import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { CatalogTable, type CatalogItem } from '../catalog-table';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/signin?callbackUrl=/catalog/products');
  }
  const role = session.user.role;
  if (role !== 'admin' && role !== 'manager') {
    redirect('/dashboard');
  }

  const rows = await prisma.softoneItem.findMany({
    where: { kind: 'product' },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      mtrl: true,
      code: true,
      code1: true,
      name: true,
      unitPrice: true,
      retailPrice: true,
      wholesalePrice: true,
      vatRate: true,
      unitName: true,
      groupName: true,
      brandName: true,
      isActive: true,
      lastSyncedAt: true,
    },
  });

  const items: CatalogItem[] = rows.map((r) => ({
    mtrl: r.mtrl,
    code: r.code,
    code1: r.code1,
    name: r.name,
    unitPrice: r.unitPrice,
    retailPrice: r.retailPrice,
    wholesalePrice: r.wholesalePrice,
    vatRate: r.vatRate,
    unitName: r.unitName,
    groupName: r.groupName,
    brandName: r.brandName,
    isActive: r.isActive,
    lastSyncedAt: r.lastSyncedAt,
  }));

  // The newest lastSyncedAt across all rows = the catalog's last refresh time.
  const lastSyncedAt = items.length > 0
    ? items.reduce((acc, it) => (it.lastSyncedAt > acc ? it.lastSyncedAt : acc), items[0].lastSyncedAt)
    : null;

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <CatalogTable kind="product" items={items} lastSyncedAt={lastSyncedAt} />
    </div>
  );
}
