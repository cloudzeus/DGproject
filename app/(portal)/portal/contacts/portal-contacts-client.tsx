'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { addPortalContact, updatePortalContact, deletePortalContact } from '../actions';

export type PortalContact = {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  isPrimary: boolean;
  hasLogin: boolean;
};

const EMPTY = { name: '', position: '', email: '', phone: '', mobile: '', isPrimary: false };

export function PortalContactsClient({ contacts }: { contacts: PortalContact[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PortalContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = adding || editing !== null;

  function startAdd() {
    setForm({ ...EMPTY });
    setEditing(null);
    setAdding(true);
    setError(null);
  }

  function startEdit(c: PortalContact) {
    setForm({
      name: c.name,
      position: c.position ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      mobile: c.mobile ?? '',
      isPrimary: c.isPrimary,
    });
    setAdding(false);
    setEditing(c);
    setError(null);
  }

  function close() {
    setAdding(false);
    setEditing(null);
    setForm({ ...EMPTY });
    setError(null);
  }

  const field = (key: keyof typeof EMPTY, label: string, placeholder?: string) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-fluent-neutral-70">{label}</label>
      <input
        value={String(form[key] ?? '')}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        maxLength={200}
        className="h-9 w-full rounded-md border border-fluent-neutral-20 px-3 text-sm focus:border-fluent-blue-500 focus:outline-none"
      />
    </div>
  );

  return (
    <div className="mt-5">
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={startAdd}>Νέα επαφή</Button>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-fluent-neutral-80">Καμία επαφή ακόμα</p>
          <p className="mt-1 text-xs text-fluent-neutral-60">
            Προσθέστε ποιος χειρίζεται τι, ώστε να απευθυνόμαστε στο σωστό άτομο.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fluent-neutral-90">
                  {c.name}
                  {c.position && (
                    <span className="ml-2 text-xs font-normal text-fluent-blue-700">{c.position}</span>
                  )}
                  {c.isPrimary && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">
                      κύρια
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-fluent-neutral-60">
                  {[c.email, c.phone, c.mobile].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {c.hasLogin && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                  έχει πρόσβαση
                </span>
              )}
              <Button variant="secondary" size="sm" onClick={() => startEdit(c)}>Επεξεργασία</Button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title={editing ? 'Επεξεργασία επαφής' : 'Νέα επαφή'} onClose={close}>
          <div className="space-y-3">
            {error && <p className="text-xs text-fluent-accent-red">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {field('name', 'Ονοματεπώνυμο')}
              {field('position', 'Ρόλος στην εταιρία', 'π.χ. Υπεύθυνος προμηθειών')}
              {field('email', 'Email')}
              {field('phone', 'Τηλέφωνο')}
              {field('mobile', 'Κινητό')}
            </div>
            <label className="flex items-center gap-2 text-xs text-fluent-neutral-70">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
              />
              Κύρια επαφή
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                disabled={pending || form.name.trim().length < 2}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const res = editing
                      ? await updatePortalContact(editing.id, form)
                      : await addPortalContact(form);
                    if (!res.ok) { setError(res.error); return; }
                    close();
                    router.refresh();
                  })
                }
              >
                Αποθήκευση
              </Button>
              <Button variant="secondary" onClick={close}>Άκυρο</Button>

              {editing && !editing.hasLogin && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  className="ml-auto"
                  onClick={() => {
                    if (!confirm(`Να διαγραφεί η επαφή «${editing.name}»;`)) return;
                    startTransition(async () => {
                      const res = await deletePortalContact(editing.id);
                      if (!res.ok) { setError(res.error); return; }
                      close();
                      router.refresh();
                    });
                  }}
                >
                  Διαγραφή
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
