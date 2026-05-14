// SoftOne ITEM (products + services) catalog sync.
//
// We pull the active ITEM list via `getBrowserInfo` + paginated `getBrowserData`,
// then upsert into the local `SoftoneItem` cache. Anything not seen in the latest
// sync is soft-deactivated (isActive=false) so it remains FK-valid for historical
// ProjectCostLine references but no longer shows up in pickers.
//
// MTRTYPE → kind discriminator (kept loose because exact values vary per tenant):
//   - 1, 11, 12, 13, 14 → product  (Είδος)
//   - 51, 52, 53, 54, 55 → service (Υπηρεσία)
//   - anything else falls back to product so nothing is silently dropped.

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

type FieldDef = { name: string; type?: string; caption?: string };

function buildColumnIndex(fields: FieldDef[]): Map<string, number> {
  const map = new Map<string, number>();
  fields.forEach((f, i) => {
    // ITEM.CODE → store under both "ITEM.CODE" and "CODE"
    map.set(f.name, i);
    const dot = f.name.indexOf('.');
    if (dot >= 0) map.set(f.name.slice(dot + 1), i);
  });
  return map;
}

function getCell(row: unknown[] | Record<string, unknown>, idx: number | undefined): unknown {
  if (idx == null || idx < 0) return undefined;
  if (Array.isArray(row)) return row[idx];
  return row[String(idx)];
}

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
 * Map raw SoftOne MTRTYPE → our local kind. Conservative — anything we don't
 * recognise stays a product so the row isn't silently dropped from the catalog.
 */
function mtrTypeToKind(mtrType: number | null): 'product' | 'service' {
  if (mtrType == null) return 'product';
  // SoftOne convention seen in the wild:
  //   1   = Είδος (commodity stock item) — product
  //   51  = Υπηρεσία (service)
  //   Other values exist (raw material, asset, etc.) — treat as product.
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

function parseRow(row: unknown[] | Record<string, unknown>, cols: Map<string, number>): SoftoneItemRow | null {
  const mtrl = toInt(getCell(row, cols.get('MTRL')));
  if (mtrl == null || mtrl <= 0) return null;
  const code = toStr(getCell(row, cols.get('CODE'))) ?? '';
  const name = toStr(getCell(row, cols.get('NAME'))) ?? '';
  if (!code && !name) return null;

  const mtrType = toInt(getCell(row, cols.get('MTRTYPE'))) ?? 1;
  const isActiveRaw = toInt(getCell(row, cols.get('ISACTIVE')));

  return {
    mtrl,
    code,
    name,
    code1: toStr(getCell(row, cols.get('CODE1'))),
    code2: toStr(getCell(row, cols.get('CODE2'))),
    name1: toStr(getCell(row, cols.get('NAME1'))),
    mtrType,
    isActive: isActiveRaw == null ? true : isActiveRaw !== 0,
    retailPrice: toFloat(getCell(row, cols.get('PRICER'))),
    wholesalePrice: toFloat(getCell(row, cols.get('PRICEW'))),
    vatRate: toFloat(getCell(row, cols.get('VATPRC'))) ?? toFloat(getCell(row, cols.get('VATRATE'))),
    vatId: toInt(getCell(row, cols.get('VAT'))),
    unitId: toInt(getCell(row, cols.get('MTRUNIT1'))),
    unitName: toStr(getCell(row, cols.get('MTRUNIT1.NAME'))) ?? toStr(getCell(row, cols.get('UNITNAME'))),
    groupId: toInt(getCell(row, cols.get('MTRGROUP'))),
    groupName: toStr(getCell(row, cols.get('MTRGROUP.NAME'))) ?? toStr(getCell(row, cols.get('GROUPNAME'))),
    brandId: toInt(getCell(row, cols.get('MTRMARK'))),
    brandName: toStr(getCell(row, cols.get('MTRMARK.NAME'))) ?? toStr(getCell(row, cols.get('BRANDNAME'))),
    manufacturerId: toInt(getCell(row, cols.get('MTRMANFCTR'))),
    manufacturerName:
      toStr(getCell(row, cols.get('MTRMANFCTR.NAME'))) ??
      toStr(getCell(row, cols.get('MANUFACTURERNAME'))),
    remarks: toStr(getCell(row, cols.get('REMARKS'))),
  };
}

const PAGE_SIZE = 500;
const MAX_PAGES = 200; // hard cap so a misconfigured browser can't loop forever

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

  let info: { success?: boolean; reqID?: string; fields?: FieldDef[]; totalcount?: number; error?: string; errorcode?: number };
  try {
    info = await s1('getBrowserInfo', {
      object: 'ITEM',
      // No explicit LIST → use default. ISACTIVE filter pulls live SKUs only.
      // Operators always "=", per SoftOne filter syntax.
      FILTERS: 'ITEM.ISACTIVE=1',
    });
  } catch (e) {
    result.ok = false;
    result.errors.push(`getBrowserInfo failed: ${e instanceof Error ? e.message : String(e)}`);
    result.durationMs = Date.now() - t0;
    return result;
  }

  if (!info.success) {
    result.ok = false;
    result.errors.push(`getBrowserInfo error (code ${info.errorcode ?? '-'}): ${info.error ?? 'unknown'}`);
    result.durationMs = Date.now() - t0;
    return result;
  }
  if (!info.reqID) {
    // Empty catalog — treat as success but deactivate everything currently active.
    result.errors.push('SoftOne returned no reqID (empty catalog?)');
  }

  const fields = info.fields ?? [];
  const cols = buildColumnIndex(fields);
  const reqId = info.reqID;
  const totalCount = info.totalcount ?? 0;

  const seenMtrls = new Set<number>();
  const parsed: SoftoneItemRow[] = [];

  if (reqId && totalCount > 0) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const start = page * PAGE_SIZE;
      if (start >= totalCount) break;

      let data: { success?: boolean; rows?: unknown[]; error?: string; errorcode?: number };
      try {
        data = await s1('getBrowserData', {
          reqID: reqId,
          START: start,
          LIMIT: PAGE_SIZE,
        });
      } catch (e) {
        result.errors.push(`page ${page} failed: ${e instanceof Error ? e.message : String(e)}`);
        result.ok = false;
        break;
      }

      if (!data.success) {
        result.errors.push(
          `getBrowserData error on page ${page} (code ${data.errorcode ?? '-'}): ${data.error ?? 'unknown'}`,
        );
        result.ok = false;
        break;
      }

      const rows = (data.rows ?? []) as Array<unknown[] | Record<string, unknown>>;
      if (rows.length === 0) break;

      for (const row of rows) {
        const r = parseRow(row, cols);
        if (!r) continue;
        seenMtrls.add(r.mtrl);
        parsed.push(r);
      }

      // Last page was short — we're done.
      if (rows.length < PAGE_SIZE) break;
    }
  }

  result.totalSeen = parsed.length;

  // Upsert each row. Done in batches via $transaction to keep DB roundtrips
  // reasonable. We don't try too hard at parallelism — SoftOne sync is a
  // batch background job, not latency-sensitive.
  const BATCH = 50;
  for (let i = 0; i < parsed.length; i += BATCH) {
    const slice = parsed.slice(i, i + BATCH);
    try {
      await prisma.$transaction(
        slice.map((r) => {
          const kind = mtrTypeToKind(r.mtrType);
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

  // Soft-deactivate anything we didn't see this run, but only if the API call
  // itself succeeded — otherwise we'd nuke the catalog on a transient outage.
  if (result.ok && seenMtrls.size > 0) {
    const seenArr = Array.from(seenMtrls);
    try {
      const deactivated = await prisma.softoneItem.updateMany({
        where: {
          isActive: true,
          mtrl: { notIn: seenArr },
        },
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
