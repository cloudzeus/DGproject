import { s1 } from './softone';

/**
 * Lookup helpers for the user-facing "company combobox": search CUSTOMER,
 * SUPPLIER and COMPANY records by free-text (name / code / AFM) and return
 * a normalized shape for the UI.
 *
 * Strategy: SoftOne's `getBrowserInfo` runs a server-side filtered query and
 * returns a paged result. We use the default browser list per object ("001")
 * and request only the columns the UI needs.
 */

export type SoftOneLookupSource = 'customer' | 'supplier' | 'company';

export type SoftOneLookupRecord = {
  /** SoftOne primary key (TRDR for customer/supplier, COMPANY for company). */
  id: number;
  /** Business code (e.g. "30.00.0001"). */
  code: string;
  /** Display name / επωνυμία. */
  name: string;
  /** Tax id (Α.Φ.Μ.) when applicable. */
  afm: string | null;
  /** City/region or other secondary line for the dropdown UI. */
  hint: string | null;
};

type ObjectConfig = {
  /** SoftOne object name (case matters). */
  object: string;
  /** Browser list — almost always "001" (the default). */
  list: string;
  /** Field prefix used inside `getBrowserInfo` filter expressions. */
  filterPrefix: string;
  /** Field name for the primary key in the returned row. */
  keyField: string;
  /** Plain SQL field names (without prefix) for code/name/afm in the resulting row. */
  fields: {
    code: string;
    name: string;
    afm?: string;
    extra?: string;
  };
};

const CONFIGS: Record<SoftOneLookupSource, ObjectConfig> = {
  customer: {
    object: 'CUSTOMER',
    list: '001',
    filterPrefix: 'CUSTOMER',
    keyField: 'TRDR',
    fields: { code: 'CODE', name: 'NAME', afm: 'AFM', extra: 'CITY' },
  },
  supplier: {
    object: 'SUPPLIER',
    list: '001',
    filterPrefix: 'SUPPLIER',
    keyField: 'TRDR',
    fields: { code: 'CODE', name: 'NAME', afm: 'AFM', extra: 'CITY' },
  },
  company: {
    object: 'COMPANY',
    list: '001',
    filterPrefix: 'COMPANY',
    keyField: 'COMPANY',
    fields: { code: 'CODE', name: 'NAME', afm: 'AFM' },
  },
};

/**
 * Build a SoftOne filter expression. Operator is always `=`; we use a trailing
 * wildcard `*` for prefix matching, which is the SoftOne convention.
 *
 * If `q` looks like a 9-digit number, we treat it as an AFM (exact match).
 * Otherwise it goes through CODE/NAME as a prefix.
 */
function buildFilter(cfg: ObjectConfig, q: string): string {
  const trimmed = q.trim();
  if (!trimmed) {
    // No query → return only active records (limit applied separately).
    return `${cfg.filterPrefix}.ISACTIVE=1`;
  }

  // Pure numeric of length 9 → exact AFM lookup
  if (/^\d{9}$/.test(trimmed) && cfg.fields.afm) {
    return `${cfg.filterPrefix}.${cfg.fields.afm}=${trimmed}`;
  }

  // Pure numeric of any length → try CODE exact match
  if (/^\d+$/.test(trimmed)) {
    return `${cfg.filterPrefix}.${cfg.fields.code}=${trimmed}`;
  }

  // Free text → wildcard NAME prefix
  return `${cfg.filterPrefix}.${cfg.fields.name}=${trimmed}*`;
}

type FieldDef = { name: string; type: string };

/**
 * SoftOne browser rows are positional ARRAYS, not keyed objects. Column meta
 * comes from `getBrowserInfo.fields`. We build a name→index map and read each
 * row by index.
 *
 * Composite-key columns (ZOOMINFO) have the form "<OBJECT>;<id>" — we parse
 * out the integer id for the UI selection.
 */
export async function softoneLookup(args: {
  source: SoftOneLookupSource;
  q: string;
  limit?: number;
}): Promise<SoftOneLookupRecord[]> {
  const cfg = CONFIGS[args.source];
  if (!cfg) throw new Error(`Unknown SoftOne lookup source: ${args.source}`);

  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
  const filter = buildFilter(cfg, args.q);

  const info = await s1('getBrowserInfo', {
    object: cfg.object,
    LIST: cfg.list,
    FILTERS: filter,
  });
  if (!info.success) {
    throw new Error(`SoftOne getBrowserInfo failed: ${info.error ?? 'unknown'} (code ${info.errorcode ?? '-'})`);
  }
  if (!info.reqID || (info.totalcount ?? 0) === 0) return [];

  const fields = (info.fields ?? []) as FieldDef[];
  const colIndex = buildColumnIndex(fields, cfg);

  const page = await s1('getBrowserData', {
    reqID: info.reqID,
    START: 0,
    LIMIT: limit,
  });
  if (!page.success) {
    throw new Error(`SoftOne getBrowserData failed: ${page.error ?? 'unknown'} (code ${page.errorcode ?? '-'})`);
  }

  const rows = (page.rows ?? []) as Array<Record<string, unknown> | unknown[]>;
  return rows.map((r) => normalizeRow(r, colIndex)).filter((r) => r.id > 0);
}

type ColumnIndex = {
  zoomInfo: number;     // composite "OBJECT;id"
  code: number;
  name: number;
  afm: number | null;
  extra: number | null;
};

function buildColumnIndex(fields: FieldDef[], cfg: ObjectConfig): ColumnIndex {
  const findIdx = (suffix: string): number => {
    // Match either "OBJECT.FIELD" or just "FIELD".
    return fields.findIndex(
      (f) => f.name === `${cfg.filterPrefix}.${suffix}` || f.name === suffix,
    );
  };

  return {
    zoomInfo: fields.findIndex((f) => f.name === 'ZOOMINFO'),
    code: findIdx(cfg.fields.code),
    name: findIdx(cfg.fields.name),
    afm: cfg.fields.afm ? findIdx(cfg.fields.afm) : null,
    extra: cfg.fields.extra ? findIdx(cfg.fields.extra) : null,
  };
}

function normalizeRow(row: Record<string, unknown> | unknown[], idx: ColumnIndex): SoftOneLookupRecord {
  // Rows are arrays in current SoftOne responses, but accept object form too.
  const get = (i: number | null): unknown => {
    if (i == null || i < 0) return null;
    if (Array.isArray(row)) return row[i];
    return row[String(i)];
  };

  const zoomInfo = String(get(idx.zoomInfo) ?? '');
  const id = parseZoomInfoId(zoomInfo);

  return {
    id,
    code: trimOrEmpty(get(idx.code)),
    name: trimOrEmpty(get(idx.name)),
    afm: toStringOrNull(get(idx.afm)),
    hint: toStringOrNull(get(idx.extra)),
  };
}

/** Extract the integer id from a "OBJECT;123" ZOOMINFO composite key. */
function parseZoomInfoId(zoomInfo: string): number {
  const parts = zoomInfo.split(';');
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : 0;
}

function trimOrEmpty(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
