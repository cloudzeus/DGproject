'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  graphIsConfigured,
  getTenantInfo,
  listTenantUsers,
  GraphError,
  type TenantUser,
} from '@/lib/microsoft-graph';

type Role = 'admin' | 'manager' | 'member' | 'viewer';
const ROLES: Role[] = ['admin', 'manager', 'member', 'viewer'];

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') throw new Error('Unauthorized');
  return session.user.id;
}

export type TenantRow = TenantUser & { existing: boolean; existingRole?: Role | null };

export type FetchTenantResult =
  | {
      ok: true;
      configured: true;
      tenant: { displayName: string; defaultDomain: string | null } | null;
      users: TenantRow[];
    }
  | { ok: false; configured: false; error?: string }
  | { ok: false; configured: true; error: string };

export async function fetchTenantDirectory(): Promise<FetchTenantResult> {
  await requireAdmin();
  if (!graphIsConfigured()) {
    return { ok: false, configured: false, error: 'Τα TENANT_ID / APPLICATION_ID / CLIENT_SECRET_VALUE δεν έχουν ρυθμιστεί.' };
  }
  try {
    const [tenant, users] = await Promise.all([getTenantInfo(), listTenantUsers()]);

    const emails = users.map((u) => u.email);
    const azureIds = users.map((u) => u.id);

    const existing = await prisma.user.findMany({
      where: { OR: [{ email: { in: emails } }, { azureAdId: { in: azureIds } }] },
      select: { email: true, azureAdId: true, role: true },
    });
    const byEmail = new Map(existing.map((e) => [e.email.toLowerCase(), e]));
    const byAzureId = new Map(existing.filter((e) => e.azureAdId).map((e) => [e.azureAdId!, e]));

    const rows: TenantRow[] = users.map((u) => {
      const match = byAzureId.get(u.id) ?? byEmail.get(u.email);
      return {
        ...u,
        existing: Boolean(match),
        existingRole: match?.role ?? null,
      };
    });

    return { ok: true, configured: true, tenant, users: rows };
  } catch (e) {
    const msg = e instanceof GraphError ? e.message : e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, configured: true, error: msg };
  }
}

export type ImportSelection = { id: string; role: Role };

export async function importTenantUsers(selections: ImportSelection[]) {
  await requireAdmin();
  if (!graphIsConfigured()) return { ok: false, error: 'Το Microsoft integration δεν έχει ρυθμιστεί.' };
  if (selections.length === 0) return { ok: false, error: 'Δεν επιλέχθηκαν χρήστες.' };

  const valid = selections.filter((s) => ROLES.includes(s.role));
  if (valid.length === 0) return { ok: false, error: 'Μη έγκυροι ρόλοι.' };

  try {
    const tenantUsers = await listTenantUsers();
    const byId = new Map(tenantUsers.map((u) => [u.id, u]));

    let created = 0;
    let updated = 0;
    for (const { id, role } of valid) {
      const tu = byId.get(id);
      if (!tu) continue;
      const email = tu.email;

      const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, { azureAdId: tu.id }] },
      });

      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            azureAdId: tu.id,
            name: tu.displayName,
            email,
          },
        });
        updated++;
      } else {
        await prisma.user.create({
          data: {
            email,
            name: tu.displayName,
            role,
            azureAdId: tu.id,
          },
        });
        created++;
      }
    }

    revalidatePath('/admin/users');
    revalidatePath('/team');
    revalidatePath('/settings');
    return { ok: true, created, updated };
  } catch (e) {
    const msg = e instanceof GraphError ? e.message : e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: msg };
  }
}
