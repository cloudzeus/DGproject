import { prisma } from './prisma';
import { s1 } from './softone';
import type { User, UserType } from '@prisma/client';

/**
 * SoftOne contact sync — drives the mapping between fluent-pm `User` rows and
 * three different SoftOne objects:
 *
 *   - userType=employee  → linked to existing SoftOne USERS (lookup only)
 *   - userType=customer  → CUSPRSN child table of CUSTOMER (the picked parent)
 *   - userType=supplier  → SUPPRSN child table of SUPPLIER (the picked parent)
 *
 * The "contact" registration is a TWO-step write:
 *
 *   1. PRSNOUT (master)  — the person record itself (name, email, phone)
 *   2. CUSPRSN / SUPPRSN — child rows on the parent customer/supplier that
 *      reference the PRSNOUT via its PRSN id
 *
 * Existing contact rows on the parent must be ECHOED BACK in the setData call,
 * otherwise SoftOne deletes any row whose LINENUM is missing from the payload.
 * We always read existing rows first and append our new contact at LINENUM 9000001+.
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
        result = await pushCustomerContact(user);
        break;
      case 'supplier':
        result = await pushSupplierContact(user);
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
// CUSTOMER contact — add user as CUSPRSN row on the picked parent CUSTOMER.
// ─────────────────────────────────────────────────────────────────────────

async function pushCustomerContact(user: User): Promise<SyncResult> {
  if (!user.softoneCustomerId) {
    return {
      ok: false,
      error:
        'Δεν έχει επιλεγεί SoftOne CUSTOMER. Άνοιξε επεξεργασία χρήστη και επίλεξε εταιρεία από το combobox.',
    };
  }
  return addContactRow({
    user,
    parentTrdr: user.softoneCustomerId,
    parentObject: 'CUSTOMER',
    childTable: 'CUSPRSN',
  });
}

async function pushSupplierContact(user: User): Promise<SyncResult> {
  if (!user.softoneSupplierId) {
    return {
      ok: false,
      error:
        'Δεν έχει επιλεγεί SoftOne SUPPLIER. Άνοιξε επεξεργασία χρήστη και επίλεξε εταιρεία από το combobox.',
    };
  }
  return addContactRow({
    user,
    parentTrdr: user.softoneSupplierId,
    parentObject: 'SUPPLIER',
    childTable: 'SUPPRSN',
  });
}

async function addContactRow(args: {
  user: User;
  parentTrdr: number;
  parentObject: 'CUSTOMER' | 'SUPPLIER';
  childTable: 'CUSPRSN' | 'SUPPRSN';
}): Promise<SyncResult> {
  const { user, parentTrdr, parentObject, childTable } = args;

  if (!user.email?.trim()) {
    return { ok: false, error: 'Ο χρήστης χρειάζεται email πριν τη δημιουργία επαφής.' };
  }

  // Step 1: ensure a PRSNOUT exists for this user. Reuse softonePrsnId if set;
  // otherwise try to find by email; otherwise create new.
  const prsnResult = await ensurePrsnOut(user);
  if (!prsnResult.ok) return prsnResult;
  const prsnId = prsnResult.prsnId;

  // Step 2: read the parent's current contact rows so we can echo them back.
  const existing = await s1('getData', {
    object: parentObject,
    KEY: String(parentTrdr),
  });
  if (!existing.success) {
    return {
      ok: false,
      error: `Αδυναμία ανάγνωσης ${parentObject} #${parentTrdr}: ${existing.error ?? 'unknown'}`,
    };
  }

  const existingRows = readChildRows(existing, childTable);

  // If this PRSN is already linked, persist the line number and stop —
  // no SoftOne write needed.
  const alreadyLinked = existingRows.find((r) => Number(r.PRSN) === prsnId);
  if (alreadyLinked) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        softonePrsnId: prsnId,
        softoneContactLine: Number(alreadyLinked.LINENUM) || null,
      },
    });
    return { ok: true, softoneId: parentTrdr, action: 'linked' };
  }

  // Compute next LINENUM. SoftOne convention: new rows ≥ 9000001.
  const maxExisting = existingRows.reduce(
    (max, r) => Math.max(max, Number(r.LINENUM) || 0),
    0,
  );
  const nextLine = Math.max(maxExisting + 1, 9_000_001);

  // Build child array: preserve every existing row + append our new contact.
  const childRows = [
    ...existingRows.map((r) => ({
      LINENUM: Number(r.LINENUM),
      PRSN: Number(r.PRSN),
      ISACTIVE: Number(r.ISACTIVE) || 1,
      TRDBRANCH: r.TRDBRANCH != null ? Number(r.TRDBRANCH) : undefined,
    })),
    {
      LINENUM: nextLine,
      PRSN: prsnId,
      ISACTIVE: 1,
    },
  ];

  const setRes = await s1('setData', {
    OBJECT: parentObject,
    KEY: String(parentTrdr),
    DATA: {
      [childTable]: childRows,
    },
  });
  if (!setRes.success) {
    return {
      ok: false,
      error: `Αδυναμία προσθήκης επαφής σε ${parentObject} #${parentTrdr}: ${setRes.error ?? 'unknown'} (code ${setRes.errorcode ?? '-'})`,
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      softonePrsnId: prsnId,
      softoneContactLine: nextLine,
    },
  });

  return { ok: true, softoneId: parentTrdr, action: 'created' };
}

// ─────────────────────────────────────────────────────────────────────────
// PRSNOUT helper — find or create the person record for a user.
// ─────────────────────────────────────────────────────────────────────────

async function ensurePrsnOut(
  user: User,
): Promise<{ ok: true; prsnId: number } | { ok: false; error: string }> {
  // 1. Reuse if we already have a linked PRSN.
  if (user.softonePrsnId) {
    return { ok: true, prsnId: user.softonePrsnId };
  }

  // 2. Search by email via browser. PRSNOUT.EMAIL is the primary contact email.
  const email = user.email.trim();
  try {
    const info = await s1('getBrowserInfo', {
      object: 'PRSNOUT',
      LIST: '001',
      FILTERS: `PRSNOUT.EMAIL=${email}`,
    });
    if (info.success && info.totalcount > 0 && info.reqID) {
      const rows = await s1('getBrowserData', { reqID: info.reqID, START: 0, LIMIT: 1 });
      if (rows.success && rows.rows?.length) {
        // Row 0 is positional. We need the PRSN id — usually in ZOOMINFO at index 0
        // as "PRSNOUT;<id>". Parse it.
        const fields = (info.fields ?? []) as Array<{ name: string }>;
        const zoomIdx = fields.findIndex((f) => f.name === 'ZOOMINFO');
        const row = rows.rows[0];
        const zoomInfo = Array.isArray(row) ? String(row[zoomIdx] ?? '') : '';
        const parts = zoomInfo.split(';');
        const id = Number(parts[parts.length - 1]);
        if (Number.isFinite(id) && id > 0) return { ok: true, prsnId: id };
      }
    }
  } catch {
    // Fall through to creation.
  }

  // 3. Create new PRSNOUT.
  const { firstName, lastName } = splitName(user.name ?? user.email);
  const code = generatePrsnCode(user);

  const createRes = await s1('setData', {
    OBJECT: 'PRSNOUT',
    KEY: '',
    DATA: {
      PRSNOUT: [
        {
          CODE: code,
          NAME: firstName,
          NAME2: lastName,
          ISACTIVE: 1,
          TPRSN: 1,            // outbound / external person
          EMAIL: email,
          AFM: user.companyAfm ?? undefined,
        },
      ],
    },
  });
  if (!createRes.success) {
    return {
      ok: false,
      error: `Αδυναμία δημιουργίας PRSNOUT: ${createRes.error ?? 'unknown'} (code ${createRes.errorcode ?? '-'})`,
    };
  }
  const newId = readKey(createRes);
  if (!newId) {
    return { ok: false, error: 'PRSNOUT δημιουργήθηκε αλλά δεν επιστράφηκε key.' };
  }
  return { ok: true, prsnId: newId };
}

// ─────────────────────────────────────────────────────────────────────────
// EMPLOYEE link — never inserts/updates. Looks up the existing SoftOne USERS
// record by email and stores its USERID + PRSN.
// ─────────────────────────────────────────────────────────────────────────

async function linkEmployee(user: User): Promise<SyncResult> {
  if (!user.email) {
    return { ok: false, error: 'Employee must have an email to link to SoftOne USERS.' };
  }

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
        const rows = await s1('getBrowserData', { reqID: info.reqID, START: 0, LIMIT: 1 });
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
      error: `Δεν βρέθηκε SoftOne USERS εγγραφή για το email "${user.email}". Ζήτησε από τον SoftOne admin να το δημιουργήσει πρώτα.`,
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
 * Pull a child table's rows out of a `getData` response. SoftOne sometimes
 * returns the child as `data.<CHILDTABLE>` (array of objects) directly, or
 * nested under `data[0].<CHILDTABLE>`. We try both shapes.
 */
function readChildRows(
  resp: Record<string, unknown>,
  childTable: string,
): Array<Record<string, unknown>> {
  const data = (resp.data ?? {}) as Record<string, unknown>;

  // Shape A: data[CHILDTABLE] = [...]
  const direct = data[childTable];
  if (Array.isArray(direct)) return direct as Array<Record<string, unknown>>;

  // Shape B: data is an array (multi-record), look on first element
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    const nested = first[childTable];
    if (Array.isArray(nested)) return nested as Array<Record<string, unknown>>;
  }

  return [];
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function generatePrsnCode(user: User): string {
  // SoftOne CODE: uppercase alphanumeric, length-limited.
  const slugBase = (user.name ?? user.email)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  const suffix = user.id.slice(-4).toUpperCase();
  return `${slugBase || 'CONTACT'}-${suffix}`;
}

function readKey(res: Record<string, unknown>): number | null {
  const key = res.key ?? res.KEY;
  if (key == null) return null;
  const n = Number(String(key).split(';')[0]);
  return Number.isFinite(n) ? n : null;
}

async function markSyncing(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { softoneSyncStatus: 'syncing', softoneSyncError: null },
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
      data: { softoneSyncStatus: 'synced', softoneSyncedAt: new Date(), softoneSyncError: null },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { softoneSyncStatus: 'error', softoneSyncError: result.error },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Project (PRJC) sync — unchanged from before. Pushes the Project to SoftOne
// PRJC, wiring PRJC.TRDR to the customerUserId's softoneCustomerId.
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
    PRJTYPE: 1,
    BLOCKED: project.status === 'on_hold' ? 1 : 0,
    REMARKS: project.description ?? '',
    FROMDATE: toS1Date(project.startDate),
    FINALDATE: toS1Date(project.dueDate),
    TRDR: customer?.softoneCustomerId ?? null,
  };

  const payload: Record<string, unknown> = {
    OBJECT: 'PRJC',
    KEY: project.softoneId ? String(project.softoneId) : '',
    DATA: { PRJC: [master] },
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
