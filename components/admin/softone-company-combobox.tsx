'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type SoftOneSource = 'customer' | 'supplier' | 'company';

export type SoftOneSelection = {
  id: number;
  code: string;
  name: string;
  afm: string | null;
  source: SoftOneSource;
};

type ApiRecord = {
  id: number;
  code: string;
  name: string;
  afm: string | null;
  hint: string | null;
};

/**
 * Search combobox over SoftOne CUSTOMER / SUPPLIER / COMPANY records.
 *
 * Debounced server-side search via /api/softone/lookup. Free text matches:
 *   - 9 digits → AFM exact match
 *   - any digits → CODE exact match
 *   - text → NAME prefix (SoftOne `*` wildcard)
 *
 * Renders three hidden form inputs so the parent <form> includes the selection
 * on submit:
 *   <name>Id      → numeric SoftOne primary key
 *   <name>Code    → CODE string
 *   <name>Name    → επωνυμία (mirrored into Project/User.companyName too)
 *
 * AFM is not duplicated as a hidden field because the parent form likely has
 * its own companyAfm input that the user may have already typed manually.
 */
export function SoftOneCompanyCombobox({
  source,
  fieldNamePrefix = 'softoneCompany',
  initial,
  disabled,
  required,
  onSelect,
}: {
  source: SoftOneSource;
  /** Hidden-input name prefix (e.g. "softoneCustomer" → "softoneCustomerId" + …Code + …Name). */
  fieldNamePrefix?: string;
  /** Pre-selected value (when editing an existing user). */
  initial?: Partial<SoftOneSelection> | null;
  disabled?: boolean;
  required?: boolean;
  onSelect?: (sel: SoftOneSelection | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SoftOneSelection | null>(
    initial && initial.id
      ? {
          id: initial.id,
          code: initial.code ?? '',
          name: initial.name ?? '',
          afm: initial.afm ?? null,
          source,
        }
      : null,
  );

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Reset selection when the source switches (e.g. user toggled type from
  // customer to supplier).
  useEffect(() => {
    if (selection && selection.source !== source) {
      setSelection(null);
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/softone/lookup?source=${source}&q=${encodeURIComponent(query)}&limit=25`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Σφάλμα');
          setResults([]);
        } else {
          setResults(data.results ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, source, open]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function selectRecord(r: ApiRecord) {
    const sel: SoftOneSelection = {
      id: r.id,
      code: r.code,
      name: r.name,
      afm: r.afm,
      source,
    };
    setSelection(sel);
    setOpen(false);
    setQuery('');
    onSelect?.(sel);
  }

  function clearSelection() {
    setSelection(null);
    setQuery('');
    onSelect?.(null);
  }

  const placeholder = useMemo(() => {
    const labels: Record<SoftOneSource, string> = {
      customer: 'Αναζήτηση πελάτη (επωνυμία / κωδικός / ΑΦΜ)…',
      supplier: 'Αναζήτηση προμηθευτή (επωνυμία / κωδικός / ΑΦΜ)…',
      company: 'Αναζήτηση εταιρείας (επωνυμία / κωδικός / ΑΦΜ)…',
    };
    return labels[source];
  }, [source]);

  return (
    <div ref={wrapperRef} className="relative">
      {/* Hidden inputs for the surrounding <form> */}
      <input
        type="hidden"
        name={`${fieldNamePrefix}Id`}
        value={selection?.id ?? ''}
        required={required && !selection}
      />
      <input type="hidden" name={`${fieldNamePrefix}Code`} value={selection?.code ?? ''} />
      <input type="hidden" name={`${fieldNamePrefix}Name`} value={selection?.name ?? ''} />
      <input type="hidden" name={`${fieldNamePrefix}Afm`} value={selection?.afm ?? ''} />

      {selection ? (
        <div className="flex items-center justify-between rounded-md border border-fluent-neutral-20 bg-white p-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{selection.name}</div>
            <div className="mt-0.5 text-xs text-fluent-neutral-60">
              ID {selection.id}
              {selection.code && ` · ${selection.code}`}
              {selection.afm && ` · ΑΦΜ ${selection.afm}`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={disabled}
              className="rounded px-2 py-1 text-xs text-fluent-blue-600 hover:bg-fluent-blue-50"
            >
              Αλλαγή
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={disabled}
              className="rounded px-2 py-1 text-xs text-fluent-neutral-60 hover:bg-fluent-neutral-4"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-10 w-full rounded-md border border-fluent-neutral-20 px-3 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      )}

      {open && !selection && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-fluent-neutral-20 bg-white shadow-lg">
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <div className="px-3 py-2 text-xs text-fluent-neutral-60">Φόρτωση…</div>
            )}
            {error && (
              <div className="px-3 py-2 text-xs text-red-600">
                {error.includes('Admin') ? 'Χρειάζεται admin/manager role' : `Σφάλμα: ${error}`}
              </div>
            )}
            {!loading && !error && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-fluent-neutral-60">
                {query ? 'Κανένα αποτέλεσμα' : 'Πληκτρολόγησε για αναζήτηση'}
              </div>
            )}
            {results.map((r) => (
              <button
                type="button"
                key={`${r.id}-${r.code}`}
                onClick={() => selectRecord(r)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-fluent-neutral-4"
              >
                <div className="truncate font-medium">{r.name || '(no name)'}</div>
                <div className="mt-0.5 text-xs text-fluent-neutral-60">
                  ID {r.id}
                  {r.code && ` · ${r.code}`}
                  {r.afm && ` · ΑΦΜ ${r.afm}`}
                  {r.hint && ` · ${r.hint}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
