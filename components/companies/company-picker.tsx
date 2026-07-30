'use client'

import { useEffect, useRef, useState } from 'react'
import { searchCompanies } from '@/app/(app)/admin/companies/actions'

export type CompanySelection = { id: string; NAME: string; AFM: string | null }

/**
 * Search combobox over the LOCAL Company table (δεν αγγίζει SoftOne).
 *
 * Debounced server-side αναζήτηση μέσω του `searchCompanies` action. Χρειάζεται
 * αναζήτηση και όχι απλό <select>: μετά τη μαζική εισαγωγή υπάρχουν ~3900
 * εταιρίες, οπότε η πλήρης λίστα θα ήταν και βαρύ payload και άχρηστη στο UI.
 *
 * Renders ένα hidden input με το επιλεγμένο id, ώστε το γονικό <form> να το
 * στείλει κανονικά στο server action.
 */
export function CompanyPicker({
  name,
  initial,
  placeholder = 'Αναζήτηση εταιρίας με επωνυμία ή ΑΦΜ…',
  disabled,
  onSelect,
}: {
  /** Όνομα του hidden input (π.χ. "primaryCompanyId"). */
  name: string
  initial?: CompanySelection | null
  placeholder?: string
  disabled?: boolean
  onSelect?: (sel: CompanySelection | null) => void
}) {
  const [selected, setSelected] = useState<CompanySelection | null>(initial ?? null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CompanySelection[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Κλείσιμο με κλικ έξω.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const id = setTimeout(async () => {
      try {
        const rows = await searchCompanies(query)
        if (!cancelled) setResults(rows)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(id) }
  }, [query, open])

  function pick(sel: CompanySelection | null) {
    setSelected(sel)
    setQuery('')
    setOpen(false)
    onSelect?.(sel)
  }

  return (
    <div className="relative" ref={boxRef}>
      <input type="hidden" name={name} value={selected?.id ?? ''} />

      {selected ? (
        <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-fluent-neutral-20 bg-white">
          <span className="flex-1 min-w-0 text-sm truncate">
            {selected.NAME}
            {selected.AFM && <span className="text-fluent-neutral-60 font-mono"> · {selected.AFM}</span>}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="text-xs text-fluent-neutral-60 hover:text-red-600 shrink-0"
            >
              Καθαρισμός
            </button>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          placeholder={placeholder}
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none disabled:bg-fluent-neutral-4"
        />
      )}

      {open && !selected && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-fluent-neutral-20 bg-white shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-fluent-neutral-60">Αναζήτηση…</p>}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-fluent-neutral-60">
              Καμία εταιρία. Πρόσθεσε στο /admin/companies.
            </p>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 hover:bg-fluent-blue-50"
              >
                <span className="block text-sm text-fluent-neutral-90 truncate">{r.NAME}</span>
                {r.AFM && <span className="block text-[11px] font-mono text-fluent-neutral-60">{r.AFM}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
