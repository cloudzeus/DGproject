'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  updateCompany, setCompanyActive, refreshFromAade,
  createContact, updateContact, deleteContact, promoteContactToUser,
} from '../actions'

type Company = {
  id: string
  NAME: string
  AFM: string | null
  CODE: string | null
  IRSDATA: string | null
  JOBTYPETRD: string | null
  ADDRESS: string | null
  ZIP: string | null
  DISTRICT: string | null
  CITY: string | null
  PHONE01: string | null
  PHONE02: string | null
  EMAIL: string | null
  WEBPAGE: string | null
  appNotes: string | null
  appLegalForm: string | null
  aadeStatus: string | null
  doyCode: string | null
  isActive: boolean
  linkedToSoftOne: boolean
  syncedAt: string | null
  aadeSyncedAt: string | null
}
type Activity = { id: string; code: string | null; description: string | null; kind: string }
type Contact = {
  id: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  isPrimary: boolean
  notes: string | null
  hasLogin: boolean
}
type UserRow = { id: string; name: string | null; email: string; role: string }
type ProjectRow = { id: string; name: string }
type RoleRow = { id: string; role: string; projectId: string; projectName: string }

const ROLE_LABEL: Record<string, string> = {
  partner: 'Συνεργάτης',
  subcontractor: 'Υπεργολάβος',
  consultant: 'Σύμβουλος',
  other: 'Άλλο',
}

const EMPTY_CONTACT = {
  name: '', position: '', email: '', phone: '', mobile: '', isPrimary: false, notes: '',
}

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : null

export function CompanyDetailClient({
  company, activities, contacts, users, clientProjects, roleProjects,
}: {
  company: Company
  activities: Activity[]
  contacts: Contact[]
  users: UserRow[]
  clientProjects: ProjectRow[]
  roleProjects: RoleRow[]
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    NAME: company.NAME,
    AFM: company.AFM ?? '',
    IRSDATA: company.IRSDATA ?? '',
    JOBTYPETRD: company.JOBTYPETRD ?? '',
    ADDRESS: company.ADDRESS ?? '',
    ZIP: company.ZIP ?? '',
    DISTRICT: company.DISTRICT ?? '',
    CITY: company.CITY ?? '',
    PHONE01: company.PHONE01 ?? '',
    PHONE02: company.PHONE02 ?? '',
    EMAIL: company.EMAIL ?? '',
    WEBPAGE: company.WEBPAGE ?? '',
    appNotes: company.appNotes ?? '',
  })
  const [editingContact, setEditingContact] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState({ ...EMPTY_CONTACT })
  const [addingContact, setAddingContact] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, onOk?: (r: T) => void) {
    setBusy(true); setError(''); setMessage('')
    try {
      const res = await fn()
      if (!res.ok) { setError(res.error ?? 'Κάτι πήγε στραβά.'); return }
      onOk?.(res)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Κάτι πήγε στραβά.')
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof typeof form, label: string) => (
    <div>
      <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
      />
    </div>
  )

  const cField = (key: keyof typeof EMPTY_CONTACT, label: string) => (
    <div>
      <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">{label}</label>
      <input
        value={String(contactForm[key] ?? '')}
        onChange={(e) => setContactForm({ ...contactForm, [key]: e.target.value })}
        className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
      />
    </div>
  )

  function startEdit(c: Contact) {
    setEditingContact(c.id)
    setAddingContact(false)
    setContactForm({
      name: c.name,
      position: c.position ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      mobile: c.mobile ?? '',
      isPrimary: c.isPrimary,
      notes: c.notes ?? '',
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/companies" className="text-xs text-fluent-blue-600">← Εταιρίες</Link>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h1 className="text-2xl font-semibold text-fluent-neutral-90">{company.NAME}</h1>
          <span
            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
              company.linkedToSoftOne
                ? 'bg-fluent-blue-50 text-fluent-blue-700'
                : 'bg-black/5 text-fluent-neutral-60'
            }`}
          >
            {company.linkedToSoftOne ? `SoftOne${company.CODE ? ` ${company.CODE}` : ''}` : 'Τοπική'}
          </span>
          {!company.isActive && (
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-black/5 text-fluent-neutral-60">
              ανενεργή
            </span>
          )}
        </div>
        <p className="text-sm text-fluent-neutral-60 mt-1">
          <span className="font-mono">ΑΦΜ {company.AFM ?? '—'}</span>
          {company.appLegalForm ? ` · ${company.appLegalForm}` : ''}
          {company.aadeStatus ? ` · ${company.aadeStatus}` : ''}
          {company.doyCode ? ` · κωδ. ΔΟΥ ${company.doyCode}` : ''}
        </p>
        <p className="text-[11px] text-fluent-neutral-50 mt-0.5">
          {fmtDate(company.syncedAt) ? `SoftOne sync: ${fmtDate(company.syncedAt)}` : 'Δεν έχει συγχρονιστεί με SoftOne'}
          {fmtDate(company.aadeSyncedAt) ? ` · ΑΑΔΕ: ${fmtDate(company.aadeSyncedAt)}` : ''}
        </p>
      </div>

      {message && <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">{message}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

      {/* ─── Στοιχεία ─── */}
      <section className="rounded-lg border border-fluent-neutral-20 bg-white p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-sm font-semibold text-fluent-neutral-90">Στοιχεία</h2>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy || !company.AFM}
              onClick={() => run(() => refreshFromAade(company.id), () => setMessage('Ενημερώθηκε από ΑΑΔΕ.'))}
            >
              Ανανέωση από ΑΑΔΕ
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => setCompanyActive(company.id, !company.isActive))}
            >
              {company.isActive ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field('NAME', 'Επωνυμία')}
          {field('AFM', 'ΑΦΜ')}
          {field('IRSDATA', 'ΔΟΥ')}
          {field('JOBTYPETRD', 'Δραστηριότητα')}
          {field('ADDRESS', 'Διεύθυνση')}
          {field('CITY', 'Πόλη')}
          {field('ZIP', 'Τ.Κ.')}
          {field('DISTRICT', 'Περιοχή')}
          {field('PHONE01', 'Τηλέφωνο')}
          {field('PHONE02', 'Τηλέφωνο 2')}
          {field('EMAIL', 'Email')}
          {field('WEBPAGE', 'Website')}
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Σημειώσεις</label>
          <textarea
            value={form.appNotes}
            onChange={(e) => setForm({ ...form, appNotes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>

        <Button
          className="mt-3"
          disabled={busy || form.NAME.trim().length < 2}
          onClick={() => run(() => updateCompany(company.id, form), () => setMessage('Αποθηκεύτηκε.'))}
        >
          Αποθήκευση
        </Button>

        {activities.length > 0 && (
          <div className="mt-4 border-t border-black/5 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50 mb-2">
              Δραστηριότητες (ΚΑΔ) · {activities.length}
            </p>
            <div className="max-h-48 overflow-y-auto">
              {activities.map((a) => (
                <p key={a.id} className="text-xs text-fluent-neutral-70 py-0.5">
                  <span className="font-mono">{a.code ?? '—'}</span> · {a.description ?? '—'}
                  {a.kind === 'PRIMARY' && (
                    <span className="ml-2 text-[10px] uppercase font-semibold text-fluent-blue-700">κύρια</span>
                  )}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ─── Επαφές ─── */}
      <section className="rounded-lg border border-fluent-neutral-20 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fluent-neutral-90">Επαφές</h2>
          <Button
            variant="secondary"
            onClick={() => {
              setAddingContact((v) => !v)
              setContactForm({ ...EMPTY_CONTACT })
              setEditingContact(null)
            }}
          >
            {addingContact ? 'Άκυρο' : 'Νέα επαφή'}
          </Button>
        </div>

        {(addingContact || editingContact) && (
          <div className="mb-4 rounded-md bg-fluent-neutral-4 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {cField('name', 'Ονοματεπώνυμο')}
              {cField('position', 'Θέση')}
              {cField('email', 'Email')}
              {cField('phone', 'Τηλέφωνο')}
              {cField('mobile', 'Κινητό')}
            </div>
            <label className="flex items-center gap-2 text-xs text-fluent-neutral-70 cursor-pointer">
              <input
                type="checkbox"
                checked={contactForm.isPrimary}
                onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
              />
              Κύρια επαφή
            </label>
            <div className="flex gap-2">
              <Button
                disabled={busy || !contactForm.name.trim()}
                onClick={() =>
                  run(
                    () =>
                      editingContact
                        ? updateContact(editingContact, contactForm)
                        : createContact(company.id, contactForm),
                    () => {
                      setAddingContact(false)
                      setEditingContact(null)
                      setContactForm({ ...EMPTY_CONTACT })
                    },
                  )
                }
              >
                Αποθήκευση
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setAddingContact(false)
                  setEditingContact(null)
                  setContactForm({ ...EMPTY_CONTACT })
                }}
              >
                Άκυρο
              </Button>
            </div>
          </div>
        )}

        <div className="divide-y divide-black/5">
          {contacts.length === 0 && <p className="text-sm text-fluent-neutral-60 py-3">Καμία επαφή.</p>}
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-medium text-fluent-neutral-90">
                  {c.name}
                  {c.isPrimary && (
                    <span className="ml-2 text-[10px] uppercase font-semibold text-fluent-blue-700">κύρια</span>
                  )}
                </p>
                <p className="text-xs text-fluent-neutral-60">
                  {[c.position, c.email, c.phone || c.mobile].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {c.hasLogin ? (
                <span className="text-[10px] uppercase font-semibold text-green-700">έχει λογαριασμό</span>
              ) : (
                <Button
                  variant="secondary"
                  disabled={busy || !c.email}
                  title={c.email ? undefined : 'Χρειάζεται email'}
                  onClick={() =>
                    run(
                      () => promoteContactToUser(c.id),
                      (r) => {
                        const res = r as { email?: string; tempPassword?: string }
                        setMessage(
                          `Λογαριασμός ${res.email} — προσωρινός κωδικός: ${res.tempPassword} · εμφανίζεται ΜΙΑ φορά, αντίγραψέ τον τώρα.`,
                        )
                      },
                    )
                  }
                >
                  Δώσε πρόσβαση
                </Button>
              )}
              <Button variant="secondary" onClick={() => startEdit(c)}>Επεξεργασία</Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Να διαγραφεί η επαφή «${c.name}»;`)) run(() => deleteContact(c.id))
                }}
              >
                Διαγραφή
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Έργα & χρήστες ─── */}
      <section className="rounded-lg border border-fluent-neutral-20 bg-white p-4">
        <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-2">Έργα</h2>
        {clientProjects.length === 0 && roleProjects.length === 0 && (
          <p className="text-sm text-fluent-neutral-60">Κανένα έργο.</p>
        )}
        {clientProjects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="flex items-center gap-3 py-2 text-sm hover:underline"
          >
            <span className="flex-1">{p.name}</span>
            <span className="text-[10px] uppercase font-semibold text-fluent-blue-700">πελάτης</span>
          </Link>
        ))}
        {roleProjects.map((r) => (
          <Link
            key={r.id}
            href={`/projects/${r.projectId}`}
            className="flex items-center gap-3 py-2 text-sm hover:underline"
          >
            <span className="flex-1">{r.projectName}</span>
            <span className="text-[10px] uppercase font-semibold text-fluent-neutral-60">
              {ROLE_LABEL[r.role] ?? r.role}
            </span>
          </Link>
        ))}

        <h2 className="text-sm font-semibold text-fluent-neutral-90 mt-5 mb-2">Χρήστες με πρόσβαση</h2>
        {users.length === 0 && <p className="text-sm text-fluent-neutral-60">Κανένας χρήστης.</p>}
        {users.map((u) => (
          <p key={u.id} className="text-sm py-1">
            {u.name ?? u.email}
            <span className="text-xs text-fluent-neutral-60"> · {u.email} · {u.role}</span>
          </p>
        ))}
      </section>
    </div>
  )
}
