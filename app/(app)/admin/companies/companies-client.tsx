'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { lookupByAfm, createCompany, runSoftOneImport } from './actions'

type Row = {
  id: string
  name: string
  afm: string | null
  code: string | null
  city: string | null
  isActive: boolean
  linkedToSoftOne: boolean
  contactCount: number
  userCount: number
  projectCount: number
}

const EMPTY = {
  NAME: '', AFM: '', IRSDATA: '', JOBTYPETRD: '', ADDRESS: '', ZIP: '',
  DISTRICT: '', CITY: '', PHONE01: '', PHONE02: '', EMAIL: '', WEBPAGE: '',
  appLegalForm: '',
}

type AadeExtra = {
  doyCode: string | null
  foundingDate: string | null
  aadeStatus: string | null
  aadeFirmKind: string | null
  activities: { code: string | null; description: string | null; kind: string; order: number }[]
}

export function CompaniesClient({
  companies, q, includeInactive, shown, total, pageSize,
}: {
  companies: Row[]
  q: string
  includeInactive: boolean
  shown: number
  total: number
  pageSize: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(q)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [aadeExtra, setAadeExtra] = useState<AadeExtra | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Debounced server-side αναζήτηση μέσω του ?q= searchParam.
  useEffect(() => {
    if (query === q) return
    const id = setTimeout(() => {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (includeInactive) params.set('inactive', '1')
      startTransition(() => router.replace(`/admin/companies?${params}`))
    }, 350)
    return () => clearTimeout(id)
  }, [query, q, includeInactive, router])

  function toggleInactive() {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (!includeInactive) params.set('inactive', '1')
    startTransition(() => router.replace(`/admin/companies?${params}`))
  }

  async function onLookup() {
    setBusy(true); setError(''); setStatus('')
    const res = await lookupByAfm(form.AFM)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }

    const notes: string[] = []
    if (!res.checksumOk) notes.push('Το ΑΦΜ αποτυγχάνει στον έλεγχο ψηφίου ελέγχου.')
    if (res.duplicates.length) {
      notes.push(
        `Υπάρχουν ήδη ${res.duplicates.length} εγγραφές με αυτό το ΑΦΜ (${res.duplicates
          .map((d) => d.NAME)
          .join(', ')}). Επιτρέπεται — τα υποκαταστήματα μοιράζονται ΑΦΜ.`,
      )
    }

    if (!res.found || !res.draft) {
      notes.push('Δεν βρέθηκε στην ΑΑΔΕ — συμπλήρωσε τα στοιχεία χειροκίνητα.')
      setAadeExtra(null)
      setForm({ ...form, AFM: res.afm })
      setStatus(notes.join(' '))
      return
    }

    const d = res.draft
    setForm({
      ...EMPTY,
      AFM: res.afm,
      NAME: d.NAME,
      IRSDATA: d.IRSDATA ?? '',
      JOBTYPETRD: d.JOBTYPETRD ?? '',
      ADDRESS: d.ADDRESS ?? '',
      ZIP: d.ZIP ?? '',
      CITY: d.CITY ?? '',
      appLegalForm: d.appLegalForm ?? '',
    })
    setAadeExtra({
      doyCode: d.doyCode,
      foundingDate: d.foundingDate,
      aadeStatus: d.aadeStatus,
      aadeFirmKind: d.aadeFirmKind,
      activities: d.activities,
    })
    notes.unshift(
      `Βρέθηκε: ${d.NAME}${d.doyDescr ? ` · ΔΟΥ ${d.doyDescr}` : ''}${d.aadeIsActive ? '' : ' · ΑΝΕΝΕΡΓΟ ΑΦΜ'}`,
    )
    setStatus(notes.join(' '))
  }

  async function onCreate() {
    setBusy(true); setError('')
    const res = await createCompany({ ...form, ...(aadeExtra ?? {}) })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/admin/companies/${res.id}`)
  }

  async function onImport() {
    if (!confirm('Να εισαχθούν όλοι οι πελάτες από το SoftOne; Οι υπάρχουσες εγγραφές θα ενημερωθούν χωρίς να χαθούν τοπικά στοιχεία.')) return
    setBusy(true); setError(''); setStatus('Εισαγωγή σε εξέλιξη…')
    const res = await runSoftOneImport()
    setBusy(false)
    if (!res.ok) { setError(res.error); setStatus(''); return }
    setStatus(`Ολοκληρώθηκε: ${res.created} νέες, ${res.updated} ενημερώθηκαν, ${res.skipped} παραλείφθηκαν.`)
    router.refresh()
  }

  const field = (key: keyof typeof EMPTY, label: string) => (
    <div>
      <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
      />
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Αναζήτηση με επωνυμία, ΑΦΜ ή κωδικό…"
          className="flex-1 h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
        <Button variant="secondary" onClick={onImport} disabled={busy}>
          Εισαγωγή από SoftOne
        </Button>
        <Button onClick={() => setCreating((v) => !v)}>{creating ? 'Άκυρο' : 'Νέα εταιρία'}</Button>
      </div>

      <div className="flex items-center justify-between mb-4 text-xs text-fluent-neutral-60">
        <span>
          {pending ? 'Αναζήτηση…' : `${shown} από ${total.toLocaleString('el-GR')}`}
          {total > pageSize && !pending && ' — περιόρισε την αναζήτηση για ακριβέστερα αποτελέσματα'}
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={includeInactive} onChange={toggleInactive} />
          Και ανενεργές
        </label>
      </div>

      {creating && (
        <Modal
          title="Νέα εταιρία"
          description="Δώσε ΑΦΜ και άντλησε τα στοιχεία από την ΑΑΔΕ, ή συμπλήρωσέ τα χειροκίνητα."
          onClose={() => setCreating(false)}
          size="lg"
        >
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">ΑΦΜ</label>
              <input
                value={form.AFM}
                onChange={(e) => setForm({ ...form, AFM: e.target.value })}
                placeholder="9-ψήφιο ΑΦΜ"
                className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm font-mono focus:border-fluent-blue-500 focus:outline-none"
              />
            </div>
            <Button onClick={onLookup} disabled={busy || !form.AFM.trim()} variant="secondary">
              Αναζήτηση ΑΑΔΕ
            </Button>
          </div>

          {status && <p className="text-xs text-fluent-neutral-70 bg-fluent-neutral-4 rounded-md px-3 py-2">{status}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            {field('NAME', 'Επωνυμία')}
            {field('appLegalForm', 'Νομική μορφή')}
            {field('IRSDATA', 'ΔΟΥ')}
            {field('JOBTYPETRD', 'Δραστηριότητα')}
            {field('ADDRESS', 'Διεύθυνση')}
            {field('CITY', 'Πόλη')}
            {field('ZIP', 'Τ.Κ.')}
            {field('DISTRICT', 'Περιοχή')}
            {field('PHONE01', 'Τηλέφωνο')}
            {field('EMAIL', 'Email')}
            {field('WEBPAGE', 'Website')}
          </div>

          {aadeExtra && aadeExtra.activities.length > 0 && (
            <p className="text-[11px] text-fluent-neutral-60">
              Θα αποθηκευτούν και {aadeExtra.activities.length} δραστηριότητες (ΚΑΔ) από την ΑΑΔΕ.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="primary" onClick={onCreate} disabled={busy || form.NAME.trim().length < 2}>
              Αποθήκευση
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>Άκυρο</Button>
          </div>
        </div>
        </Modal>
      )}

      <div className="rounded-lg border border-fluent-neutral-20 bg-white divide-y divide-black/5">
        {companies.length === 0 && (
          <p className="p-6 text-sm text-fluent-neutral-60 text-center">
            {q ? 'Κανένα αποτέλεσμα.' : 'Καμία εταιρία.'}
          </p>
        )}
        {companies.map((c) => (
          <Link
            key={c.id}
            href={`/admin/companies/${c.id}`}
            className="flex items-center gap-4 px-4 py-3 hover:bg-black/[0.02]"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fluent-neutral-90 truncate">
                {c.name}
                {!c.isActive && <span className="ml-2 text-xs text-fluent-neutral-50">(ανενεργή)</span>}
              </p>
              <p className="text-xs text-fluent-neutral-60 font-mono truncate">
                {c.afm ?? '—'}
                {c.code ? ` · ${c.code}` : ''}
                {c.city ? ` · ${c.city}` : ''}
              </p>
            </div>
            <span
              className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                c.linkedToSoftOne
                  ? 'bg-fluent-blue-50 text-fluent-blue-700'
                  : 'bg-black/5 text-fluent-neutral-60'
              }`}
            >
              {c.linkedToSoftOne ? 'SoftOne' : 'Τοπική'}
            </span>
            <span className="shrink-0 text-xs text-fluent-neutral-60 tabular-nums w-36 text-right">
              {c.contactCount} επαφές · {c.projectCount} έργα
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
