// SoftOne ITEM (products + services) catalog sync.
//
// Powered by SoftOne's `SqlData` service: a SQL query saved on the ERP side
// returns the catalog scoped to whichever DGSOFT subsidiary we care about
// (DGSMART = company 900). The query name lives in env var
// `S1_ITEMS_SQL_NAME` — defaults to `FLUENT_GET_ITEMS` if unset.
//
// Why `SqlData` instead of `getBrowserInfo`: the web service login user has
// access across all DGSOFT subsidiaries, but `getData`/`getBrowserInfo` calls
// pin to the COMPANY used at authenticate-time. The cleanest cross-company
// read is via a saved SQL query that scopes by `MTRL.COMPANY` (or whatever
// linkage the SoftOne DB uses) inside the SQL itself.
//
// The SQL **must** return these columns (case-sensitive, plain SQL aliases):
//   - MTRL       INTEGER, primary key
//   - CODE       VARCHAR
//   - NAME       VARCHAR
//   - MTRTYPE    INTEGER     (used to split product/service — 51-59 = service)
//   - PRICEW     FLOAT       (χονδρικής — used as default unitPrice)
//   - PRICER     FLOAT       (λιανικής)
//   - VATRATE    FLOAT       (the actual percentage, joined from VAT)
//   - ISACTIVE   INTEGER     (1 = ενεργό)
// Optional but recommended:
//   - CODE1      VARCHAR     (barcode)
//   - CODE2      VARCHAR     (factory code)
//   - NAME1      VARCHAR     (secondary description)
//   - VATID      INTEGER
//   - UNITID     INTEGER
//   - UNITNAME   VARCHAR
//   - GROUPID    INTEGER
//   - GROUPNAME  VARCHAR
//   - BRANDID    INTEGER
//   - BRANDNAME  VARCHAR
//   - MFGID      INTEGER
//   - MFGNAME    VARCHAR
//   - REMARKS    VARCHAR
//
// Items not returned in a successful run are soft-deactivated (isActive=false)
// — they stay in the DB so historical ProjectCostLine FKs remain valid, but
// disappear from the pickers.

import { prisma } from './prisma';
import { s1 } from './softone';

export type SyncResult = {
  ok: boolean;
  totalSeen: number;
  upserted: number;
  deactivated: number;
  errors: string[];
  durationMs: number;
};

type Row = Record<string, unknown>;

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function toInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFloat(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * SoftOne MTRTYPE → our local kind. Conservative — anything we don't recognise
 * stays a product so the row isn't silently dropped.
 */
function mtrTypeToKind(mtrType: number | null): 'product' | 'service' {
  if (mtrType == null) return 'product';
  if (mtrType >= 51 && mtrType <= 59) return 'service';
  return 'product';
}

type SoftoneItemRow = {
  mtrl: number;
  code: string;
  name: string;
  code1: string | null;
  code2: string | null;
  name1: string | null;
  mtrType: number;
  isActive: boolean;
  retailPrice: number | null;
  wholesalePrice: number | null;
  vatRate: number | null;
  vatId: number | null;
  unitId: number | null;
  unitName: string | null;
  groupId: number | null;
  groupName: string | null;
  brandId: number | null;
  brandName: string | null;
  manufacturerId: number | null;
  manufacturerName: string | null;
  remarks: string | null;
};

/** Read a column from a SqlData row using any of several aliases (defensive
 * — SoftOne SQL output can vary in casing/naming across saved queries). */
function pick(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
    const upper = k.toUpperCase();
    if (row[upper] !== undefined) return row[upper];
    const lower = k.toLowerCase();
    if (row[lower] !== undefined) return row[lower];
  }
  return undefined;
}

function parseRow(row: Row): SoftoneItemRow | null {
  const mtrl = toInt(pick(row, 'MTRL'));
  if (mtrl == null || mtrl <= 0) return null;
  const code = toStr(pick(row, 'CODE')) ?? '';
  const name = toStr(pick(row, 'NAME')) ?? '';
  if (!code && !name) return null;

  const mtrType = toInt(pick(row, 'MTRTYPE')) ?? 1;
  const isActiveRaw = toInt(pick(row, 'ISACTIVE'));

  return {
    mtrl,
    code,
    name,
    code1: toStr(pick(row, 'CODE1')),
    code2: toStr(pick(row, 'CODE2')),
    name1: toStr(pick(row, 'NAME1')),
    mtrType,
    isActive: isActiveRaw == null ? true : isActiveRaw !== 0,
    retailPrice: toFloat(pick(row, 'PRICER', 'RETAILPRICE')),
    wholesalePrice: toFloat(pick(row, 'PRICEW', 'WHOLESALEPRICE')),
    vatRate: toFloat(pick(row, 'VATRATE', 'VATPRC')),
    vatId: toInt(pick(row, 'VATID', 'VAT')),
    unitId: toInt(pick(row, 'UNITID', 'MTRUNIT1')),
    unitName: toStr(pick(row, 'UNITNAME', 'UNITSHORT')),
    groupId: toInt(pick(row, 'GROUPID', 'MTRGROUP')),
    groupName: toStr(pick(row, 'GROUPNAME')),
    brandId: toInt(pick(row, 'BRANDID', 'MTRMARK')),
    brandName: toStr(pick(row, 'BRANDNAME', 'MARKNAME')),
    manufacturerId: toInt(pick(row, 'MFGID', 'MTRMANFCTR', 'MANUFACTURERID')),
    manufacturerName: toStr(pick(row, 'MFGNAME', 'MANUFACTURERNAME')),
    remarks: toStr(pick(row, 'REMARKS')),
  };
}

export async function syncSoftoneItems(): Promise<SyncResult> {
  const t0 = Date.now();
  const result: SyncResult = {
    ok: true,
    totalSeen: 0,
    upserted: 0,
    deactivated: 0,
    errors: [],
    durationMs: 0,
  };

  const sqlName = (process.env.S1_ITEMS_SQL_NAME ?? 'FLUENT_GET_ITEMS').trim();
  if (!sqlName) {
    result.ok = false;
    result.errors.push('S1_ITEMS_SQL_NAME is empty');
    result.durationMs = Date.now() - t0;
    return result;
  }

  let response: { success?: boolean; rows?: Row[]; error?: string; errorcode?: number };
  try {
    response = await s1('SqlData', {
      // Some SoftOne installations expect uppercase keys here. Send both casings
      // so the saved query is found regardless of the server-side handler.
      SQLNAME: sqlName,
      sqlname: sqlName,
    });
  } catch (e) {
    result.ok = false;
    result.errors.push(`SqlData failed: ${e instanceof Error ? e.message : String(e)}`);
    result.durationMs = Date.now() - t0;
    return result;
  }

  if (!response.success) {
    result.ok = false;
    result.errors.push(
      `SqlData error (code ${response.errorcode ?? '-'}): ${response.error ?? 'unknown'}`,
    );
    result.durationMs = Date.now() - t0;
    return result;
  }

  const rows = response.rows ?? [];
  const seenMtrls = new Set<number>();
  const parsed: SoftoneItemRow[] = [];

  for (const row of rows) {
    const r = parseRow(row);
    if (!r) continue;
    seenMtrls.add(r.mtrl);
    parsed.push(r);
  }

  result.totalSeen = parsed.length;

  // Upsert in batches of 50. SoftOne sync is a background job — not
  // latency-sensitive, so we keep concurrency low to spare the DB.
  const BATCH = 50;
  for (let i = 0; i < parsed.length; i += BATCH) {
    const slice = parsed.slice(i, i + BATCH);
    try {
      await prisma.$transaction(
        slice.map((r) => {
          const kind = mtrTypeToKind(r.mtrType);
          // Default unitPrice = wholesale (per user preference); fall back to
          // retail, then 0 if neither is present.
          const unitPrice = r.wholesalePrice ?? r.retailPrice ?? 0;
          return prisma.softoneItem.upsert({
            where: { mtrl: r.mtrl },
            create: {
              mtrl: r.mtrl,
              code: r.code,
              code1: r.code1,
              code2: r.code2,
              name: r.name,
              name1: r.name1,
              kind,
              mtrType: r.mtrType,
              unitPrice,
              retailPrice: r.retailPrice,
              wholesalePrice: r.wholesalePrice,
              vatRate: r.vatRate,
              vatId: r.vatId,
              unitId: r.unitId,
              unitName: r.unitName,
              groupId: r.groupId,
              groupName: r.groupName,
              brandId: r.brandId,
              brandName: r.brandName,
              manufacturerId: r.manufacturerId,
              manufacturerName: r.manufacturerName,
              remarks: r.remarks,
              isActive: r.isActive,
              lastSyncedAt: new Date(),
            },
            update: {
              code: r.code,
              code1: r.code1,
              code2: r.code2,
              name: r.name,
              name1: r.name1,
              kind,
              mtrType: r.mtrType,
              unitPrice,
              retailPrice: r.retailPrice,
              wholesalePrice: r.wholesalePrice,
              vatRate: r.vatRate,
              vatId: r.vatId,
              unitId: r.unitId,
              unitName: r.unitName,
              groupId: r.groupId,
              groupName: r.groupName,
              brandId: r.brandId,
              brandName: r.brandName,
              manufacturerId: r.manufacturerId,
              manufacturerName: r.manufacturerName,
              remarks: r.remarks,
              isActive: r.isActive,
              lastSyncedAt: new Date(),
            },
          });
        }),
      );
      result.upserted += slice.length;
    } catch (e) {
      result.errors.push(`batch upsert failed at offset ${i}: ${e instanceof Error ? e.message : String(e)}`);
      result.ok = false;
    }
  }

  // Soft-deactivate items we didn't see this run, but only when the API call
  // itself succeeded — otherwise a transient outage would nuke the catalog.
  if (result.ok && seenMtrls.size > 0) {
    const seenArr = Array.from(seenMtrls);
    try {
      const deactivated = await prisma.softoneItem.updateMany({
        where: { isActive: true, mtrl: { notIn: seenArr } },
        data: { isActive: false, lastSyncedAt: new Date() },
      });
      result.deactivated = deactivated.count;
    } catch (e) {
      result.errors.push(`deactivation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  result.durationMs = Date.now() - t0;
  return result;
}
