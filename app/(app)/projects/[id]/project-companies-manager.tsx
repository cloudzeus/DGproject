'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Building20Regular, Dismiss16Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { CompanyPicker, type CompanySelection } from '@/components/companies/company-picker';
import { addProjectCompany, removeProjectCompany } from '@/app/(app)/admin/companies/actions';

/**
 * Οι εταιρίες που συμμετέχουν στο έργο ΕΚΤΟΣ του πελάτη.
 *
 * Ο πελάτης είναι το Project.primaryCompanyId και ορίζεται από τη φόρμα έργου —
 * εμφανίζεται εδώ μόνο για αναφορά, ώστε να φαίνεται η πλήρης εικόνα σε ένα
 * σημείο. Η διάκριση δεν είναι κοσμητική: το portal πελατών διαβάζει ΜΟΝΟ τον
 * πελάτη, οπότε ένας συνεργάτης δεν βλέπει ποτέ το έργο.
 */

type Role = 'partner' | 'subcontractor' | 'consultant' | 'other';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'partner', label: 'Συνεργάτης' },
  { value: 'subcontractor', label: 'Υπεργολάβος' },
  { value: 'consultant', label: 'Σύμβουλος' },
  { value: 'other', label: 'Άλλο' },
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label]),
);

type Associate = {
  id: string;
  role: string;
  company: { id: string; NAME: string; AFM: string | null };
};

export function ProjectCompaniesManager({
  projectId,
  canManage,
  client,
  associates,
}: {
  projectId: string;
  canManage: boolean;
  client: { id: string; NAME: string; AFM: string | null } | null;
  associates: Associate[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<CompanySelection | null>(null);
  const [role, setRole] = useState<Role>('partner');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      const res = await addProjectCompany(projectId, picked.id, role);
      if (!res.ok) { setError(res.error); return; }
      setPicked(null);
      setRole('partner');
      setOpen(false);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeProjectCompany(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="p-4 border-b border-black/5 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Εταιρίες έργου</h2>
        {canManage && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Building20Regular />}
            onClick={() => { setOpen((v) => !v); setError(null); setPicked(null); }}
          >
            {open ? 'Άκυρο' : 'Προσθήκη'}
          </Button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

        {open && canManage && (
          <div className="rounded-lg bg-fluent-neutral-4 p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Εταιρία</label>
              <CompanyPicker name="_associateCompany" initial={picked} onSelect={setPicked} />
            </div>
            <div>
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Ρόλος</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm bg-white focus:border-fluent-blue-500 focus:outline-none"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-fluent-neutral-60">
              Ο πελάτης δεν ορίζεται εδώ — αλλάζει από την επεξεργασία του έργου. Οι εταιρίες
              αυτής της λίστας ΔΕΝ βλέπουν το έργο στο portal πελατών.
            </p>
            <Button size="sm" onClick={add} disabled={pending || !picked}>Προσθήκη</Button>
          </div>
        )}

        {/* Πελάτης — read-only εδώ */}
        <div className="flex items-center gap-3 py-1.5">
          <div className="flex-1 min-w-0">
            {client ? (
              <Link href={`/admin/companies/${client.id}`} className="text-sm font-medium hover:underline">
                {client.NAME}
                {client.AFM && <span className="text-fluent-neutral-60 font-mono"> · {client.AFM}</span>}
              </Link>
            ) : (
              <span className="text-sm text-fluent-neutral-60">Δεν έχει οριστεί πελάτης</span>
            )}
          </div>
          <span className="shrink-0 text-[10px] uppercase font-semibold text-fluent-blue-700">πελάτης</span>
        </div>

        {associates.map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-1.5 border-t border-black/5">
            <Link
              href={`/admin/companies/${a.company.id}`}
              className="flex-1 min-w-0 text-sm hover:underline truncate"
            >
              {a.company.NAME}
              {a.company.AFM && <span className="text-fluent-neutral-60 font-mono"> · {a.company.AFM}</span>}
            </Link>
            <span className="shrink-0 text-[10px] uppercase font-semibold text-fluent-neutral-60">
              {ROLE_LABEL[a.role] ?? a.role}
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => remove(a.id)}
                disabled={pending}
                title="Αφαίρεση"
                className="shrink-0 text-fluent-neutral-50 hover:text-red-600 disabled:opacity-40"
              >
                <Dismiss16Regular />
              </button>
            )}
          </div>
        ))}

        {associates.length === 0 && !open && (
          <p className="text-xs text-fluent-neutral-60 border-t border-black/5 pt-2">
            Καμία άλλη συμμετέχουσα εταιρία.
          </p>
        )}
      </div>
    </div>
  );
}
