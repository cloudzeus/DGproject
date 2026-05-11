import { prisma } from './prisma';
import { s1 } from './softone';
import type { User, UserType } from '@prisma/client';

/**
 * SoftOne contact sync — drives the mapping between fluent-pm `User` rows and
 * three different SoftOne objects:
 *
 *   - userType=employee  → SoftOne USERS (login user) + PRSN (person/salesman)
 *   - userType=customer  → SoftOne CUSTOMER (TRDR)
 *   - userType=supplier  → SoftOne SUPPLIER (TRDR)
 *
 * Sync is *always* triggered explicitly (POST /api/admin/users/:id/sync-softone);
 * we never auto-push on every User change to avoid surprising side effects on
 * the ERP. Pull-down sync (read from SoftOne into fluent-pm) is a separate
 * concern handled by softone-import.ts.
 *
 * Required SoftOne fields per object (from the cached schema in skill data):
 *
 *   CUSTOMER (object) — master row in TRDR table
 *     required: CODE, NAME, AFM, IRSDATA (DOY), ISACTIVE
 *     useful : TRDPGROUP (category), EMAIL, PHONE01, ADDRESS, ZIP, CITY,
 *              SOCURRENCY, CCCJOBTYPE, TRDR (autoinc PK)
 *
 *   SUPPLIER (object) — master row in TRDR table (different sodtype than CUSTOMER)
 *     required: CODE, NAME, AFM, IRSDATA, ISACTIVE
 *     useful : same as CUSTOMER
 *
 *   USERS (object) — login users
 *     required: NAME (login), CODE, NAMES (display), ISACTIVE
 */

export type SyncResult =
  | { ok: true; softoneId: number; code?: string; action: 'created' | 'updated' | 'linked' }
  | { ok: false; error: string; code?: string };

// ─────────────────────────────────────────────────────────────────────────
// Public entrypoint — dispatches by userType.
// ─────────────────────────────────────────────────────────────────────────

export async function syncUserToSoftOne(userId: string): Promise<SyncResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: `User ${userId} not found` };

  await markSyncing(userId);

  let result: SyncResult;
  try {
    switch (user.userType) {
      case 'customer':
        result = await pushCustomer(user);
        break;
      case 'supplier':
        result = await pushSupplier(user);
        break;
      case 'employee':
        result = await linkEmployee(user);
        break;
      default:
        result = { ok: false, error: `Unknown userType ${user.userType satisfies never}` };
    }
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  await persistResult(userId, user.userType, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// CUSTOMER push — insert or update via SoftOne setData.
// ─────────────────────────────────────────────────────────────────────────

async function pushCustomer(user: User): Promise<SyncResult> {
  const guard = guardRequiredFields(user, ['customer']);
  if (guard) return guard;

  const payload: Record<string, unknown> = {
    OBJECT: 'CUSTOMER',
    KEY: user.softoneCustomerId ? String(user.softoneCustomerId) : '',
    DATA: {
      CUSTOMER: [buildPartyMaster(user)],
    },
  };

  const res = await s1('setData', payload);
  if (!res.success) {
    return {
      ok: false,
      error: `SoftOne setData CUSTOMER failed: ${res.error ?? 'unknown'} (code ${res.errorcode ?? '-'})`,
    };
  }

  const newKey = readKey(res);
  const action: 'created' | 'updated' = user.softoneCustomerId ? 'updated' : 'created';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      softoneCustomerId: newKey ?? user.softoneCustomerId,
    },
  });

  return { ok: true, softoneId: newKey ?? user.softoneCustomerId!, action };
}

// ─────────────────────────────────────────────────────────────────────────
// SUPPLIER push — same pattern, different object name.
// ─────────────────────────────────────────────────────────────────────────

async function pushSupplier(user: User): Promise<SyncResult> {
  const guard = guardRequiredFields(user, ['supplier']);
  if (guard) return guard;

  const payload: Record<string, unknown> = {
    OBJECT: 'SUPPLIER',
    KEY: user.softoneSupplierId ? String(user.softoneSupplierId) : '',
    DATA: {
      SUPPLIER: [buildPartyMaster(user)],
    },
  };

  const res = await s1('setData', payload);
  if (!res.success) {
    return {
      ok: false,
      error: `SoftOne setData SUPPLIER failed: ${res.error ?? 'unknown'} (code ${res.errorcode ?? '-'})`,
    };
  }

  const newKey = readKey(res);
  const action: 'created' | 'updated' = user.softoneSupplierId ? 'updated' : 'created';

  await prisma.user.update({
    where: { id: user.id },
    data: {
      softoneSupplierId: newKey ?? user.softoneSupplierId,
    },
  });

  return { ok: true, softoneId: newKey ?? user.softoneSupplierId!, action };
}

// ─────────────────────────────────────────────────────────────────────────
// EMPLOYEE link — never inserts/updates. Looks up the existing SoftOne USERS
// record by email (USERS.MAILACC or similar) and stores its USERID + PRSN.
//
// Rationale: SoftOne users are administered inside the ERP by IT (rights,
// licenses, modules). Auto-creating them from fluent-pm would be confusing
// and a security smell. We only *link* what already exists.
// ─────────────────────────────────────────────────────────────────────────

async function linkEmployee(user: User): Promise<SyncResult> {
  if (!user.email) {
    return { ok: false, error: 'Employee must have an email to link to SoftOne USERS.' };
  }

  // Try to find by email using a browser query against USERS.
  // The exact filter field may vary per tenant (MAILACC, EMAIL, etc.).
  // We try the common ones in order.
  const candidates = ['USERS.MAILACC', 'USERS.EMAIL'];
  let found: { userId: number; prsn: number | null; code: string | null } | null = null;

  for (const field of candidates) {
    try {
      const info = await s1('getBrowserInfo', {
        object: 'USERS',
        LIST: '001',
        FILTERS: `${field}=${user.email}`,
      });
      if (info.success && info.totalcount > 0 && info.reqID) {
        const rows = await s1('getBrowserData', {
          reqID: info.reqID,
          start: 0,
          limit: 1,
        });
        if (rows.success && rows.rows?.length) {
          const r = rows.rows[0] as Record<string, unknown>;
          found = {
            userId: Number(r.USERID ?? r['USERS.USERID']),
            prsn: r.PRSN != null ? Number(r.PRSN) : null,
            code: (r.CODE ?? r['USERS.CODE'])?.toString() ?? null,
          };
          break;
        }
      }
    } catch {
      // Try next candidate
    }
  }

  if (!found || !Number.isFinite(found.userId)) {
    return {
      ok: false,
      error: `No SoftOne USERS record matched email "${user.email}". Ask IT to create it in SoftOne first, then re-sync.`,
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      softoneUserId: found.userId,
      softonePrsnId: found.prsn ?? undefined,
    },
  });

  return { ok: true, softoneId: found.userId, code: found.code ?? undefined, action: 'linked' };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Common master-row shape for CUSTOMER and SUPPLIER. SoftOne accepts
 * arbitrary subsets — only required fields are checked by `guardRequiredFields`
 * upstream. Optional fields are included only when non-null.
 */
function buildPartyMaster(user: User): Record<string, unknown> {
  const row: Record<string, unknown> = {
    NAME: user.companyName ?? user.name ?? user.email,
    AFM: user.companyAfm,
    EMAIL: user.email,
    ISACTIVE: 1,
  };

  // Default CODE only on insert. SoftOne also supports leaving CODE empty and
  // letting the ERP auto-generate it via a series, but that requires extra
  // config so we pre-fill a deterministic value.
  const isInsert = !user.softoneCustomerId && !user.softoneSupplierId;
  if (isInsert) {
    row.CODE = generateCode(user);
  }

  return row;
}

function generateCode(user: User): string {
  const base = (user.companyName ?? user.name ?? user.email).toString();
  // Slugify into uppercase alphanumeric, trim to 12 chars, then suffix with last 4 of cuid.
  const slug = base
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  const suffix = user.id.slice(-4).toUpperCase();
  return `${slug}-${suffix}`;
}

/** Read the new primary key from a setData response. */
function readKey(res: Record<string, unknown>): number | null {
  const key = res.key ?? res.KEY;
  if (key == null) return null;
  const n = Number(String(key).split(';')[0]);
  return Number.isFinite(n) ? n : null;
}

function guardRequiredFields(user: User, _types: UserType[]): SyncResult | null {
  if (!user.companyName?.trim()) {
    return { ok: false, error: 'companyName is required for SoftOne sync.' };
  }
  if (!user.companyAfm?.trim()) {
    return {
      ok: false,
      error: 'companyAfm (Α.Φ.Μ.) is required for SoftOne CUSTOMER/SUPPLIER records.',
    };
  }
  if (!user.email?.trim()) {
    return { ok: false, error: 'email is required.' };
  }
  return null;
}

async function markSyncing(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      softoneSyncStatus: 'syncing',
      softoneSyncError: null,
    },
  });
}

async function persistResult(
  userId: string,
  _type: UserType,
  result: SyncResult,
): Promise<void> {
  if (result.ok) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        softoneSyncStatus: 'synced',
        softoneSyncedAt: new Date(),
        softoneSyncError: null,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: {
        softoneSyncStatus: 'error',
        softoneSyncError: result.error,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Project (PRJC) sync — exported for symmetry; same pattern as customer/supplier.
// Push a Project to SoftOne PRJC, linking PRJC.TRDR if customerUserId is set.
// ─────────────────────────────────────────────────────────────────────────

export async function syncProjectToSoftOne(projectId: string): Promise<SyncResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { owner: { select: { softonePrsnId: true } } },
  });
  if (!project) return { ok: false, error: `Project ${projectId} not found` };

  await prisma.project.update({
    where: { id: projectId },
    data: { softoneSyncStatus: 'syncing', softoneSyncError: null },
  });

  const customer = project.customerUserId
    ? await prisma.user.findUnique({
        where: { id: project.customerUserId },
        select: { softoneCustomerId: true },
      })
    : null;

  const master: Record<string, unknown> = {
    NAME: project.name,
    CODE: project.projectCode ?? generateProjectCode(project.id),
    ISACTIVE: project.status === 'archived' ? 0 : 1,
    PRJTYPE: 1, // default project type — tenant should configure this
    BLOCKED: project.status === 'on_hold' ? 1 : 0,
    REMARKS: project.description ?? '',
    FROMDATE: toS1Date(project.startDate),
    FINALDATE: toS1Date(project.dueDate),
    TRDR: customer?.softoneCustomerId ?? null,
  };

  const payload: Record<string, unknown> = {
    OBJECT: 'PRJC',
    KEY: project.softoneId ? String(project.softoneId) : '',
    DATA: {
      PRJC: [master],
    },
  };

  const res = await s1('setData', payload);
  if (!res.success) {
    const error = `SoftOne setData PRJC failed: ${res.error ?? 'unknown'} (code ${res.errorcode ?? '-'})`;
    await prisma.project.update({
      where: { id: projectId },
      data: { softoneSyncStatus: 'error', softoneSyncError: error },
    });
    return { ok: false, error };
  }

  const newKey = readKey(res);
  const action: 'created' | 'updated' = project.softoneId ? 'updated' : 'created';

  await prisma.project.update({
    where: { id: projectId },
    data: {
      softoneId: newKey ?? project.softoneId,
      projectCode: project.projectCode ?? (master.CODE as string),
      softoneSyncStatus: 'synced',
      softoneSyncedAt: new Date(),
      softoneSyncError: null,
    },
  });

  return { ok: true, softoneId: newKey ?? project.softoneId!, code: master.CODE as string, action };
}

function generateProjectCode(id: string): string {
  const year = new Date().getFullYear();
  return `PRJ-${year}-${id.slice(-6).toUpperCase()}`;
}

function toS1Date(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
