'use client'

import { useMemo, useState } from 'react'
import { FileRow, fileKind, type PortalFile } from '@/components/portal/file-row'
import { cn } from '@/lib/utils'

type BrowserFile = PortalFile & { projectId: string | null; projectName: string | null }

/**
 * Αναζήτηση και φιλτράρισμα πάνω σε ήδη εγκεκριμένα δεδομένα.
 *
 * Όλα τα αρχεία που φτάνουν εδώ έχουν ήδη περάσει τις πύλες ορατότητας στον
 * server. Το φιλτράρισμα εδώ είναι ΜΟΝΟ εργονομία — δεν κρύβει τίποτα που δεν
 * επιτρέπεται, γιατί τίποτα τέτοιο δεν έχει σταλεί.
 */

const KINDS = [
  { key: 'all', label: 'Όλα' },
  { key: 'pdf', label: 'PDF' },
  { key: 'doc', label: 'Έγγραφα' },
  { key: 'sheet', label: 'Υπολογιστικά' },
  { key: 'image', label: 'Εικόνες' },
] as const

export function PortalFilesBrowser({ files }: { files: BrowserFile[] }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('all')
  const [project, setProject] = useState<string>('all')

  const projects = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of files) if (f.projectId && f.projectName) map.set(f.projectId, f.projectName)
    return [...map.entries()]
  }, [files])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return files.filter((f) => {
      if (kind !== 'all' && fileKind(f.mimeType) !== kind) return false
      if (project !== 'all' && f.projectId !== project) return false
      if (!needle) return true
      return (
        f.name.toLowerCase().includes(needle) ||
        (f.title?.toLowerCase().includes(needle) ?? false) ||
        (f.projectName?.toLowerCase().includes(needle) ?? false)
      )
    })
  }, [files, q, kind, project])

  // Ομαδοποίηση ανά έργο μόνο όταν δεν έχει επιλεγεί έργο — αλλιώς η κεφαλίδα θα
  // επαναλάμβανε το ίδιο όνομα σε κάθε ομάδα του ενός.
  const grouped = useMemo(() => {
    if (project !== 'all') return null
    const map = new Map<string, BrowserFile[]>()
    for (const f of visible) {
      const key = f.projectName ?? 'Χωρίς έργο'
      const bucket = map.get(key)
      if (bucket) bucket.push(f)
      else map.set(key, [f])
    }
    return [...map.entries()]
  }, [visible, project])

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-12 text-center">
        <p className="text-sm font-medium text-fluent-neutral-80">Δεν υπάρχουν αρχεία ακόμα</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-fluent-neutral-60">
          Ό,τι κοινοποιεί η ομάδα και ό,τι στέλνετε εσείς θα εμφανίζεται εδώ.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fluent-neutral-40"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Αναζήτηση σε ονόματα αρχείων…"
            aria-label="Αναζήτηση αρχείων"
            className="h-9 w-full rounded-md border border-fluent-neutral-20 bg-white pl-9 pr-3 text-sm text-fluent-neutral-90 placeholder:text-fluent-neutral-50 focus:border-fluent-blue-500 focus:outline-none focus:ring-1 focus:ring-fluent-blue-500"
          />
        </div>

        {projects.length > 1 && (
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            aria-label="Φίλτρο έργου"
            className="h-9 rounded-md border border-fluent-neutral-20 bg-white px-2.5 text-sm text-fluent-neutral-90 focus:border-fluent-blue-500 focus:outline-none focus:ring-1 focus:ring-fluent-blue-500"
          >
            <option value="all">Όλα τα έργα</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => {
          const count =
            k.key === 'all'
              ? files.length
              : files.filter((f) => fileKind(f.mimeType) === k.key).length
          if (count === 0 && k.key !== 'all') return null

          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150',
                kind === k.key
                  ? 'bg-fluent-blue-50 text-fluent-blue-700'
                  : 'text-fluent-neutral-70 hover:bg-black/5',
              )}
            >
              {k.label}
              <span className="tabular-nums text-fluent-neutral-50">{count}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-10 text-center">
          <p className="text-sm text-fluent-neutral-60">Κανένα αρχείο δεν ταιριάζει.</p>
        </div>
      ) : grouped ? (
        <div className="space-y-5">
          {grouped.map(([name, rows]) => (
            <section key={name}>
              <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
                {name}
                <span className="ml-1.5 font-normal tabular-nums text-fluent-neutral-50">
                  {rows.length}
                </span>
              </h2>
              <div className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
                {rows.map((f) => (
                  <FileRow key={f.id} file={f} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
          {visible.map((f) => (
            <FileRow key={f.id} file={f} />
          ))}
        </div>
      )}
    </div>
  )
}
