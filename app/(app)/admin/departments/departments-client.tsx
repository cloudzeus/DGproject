'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Add20Filled, Edit20Regular, Delete20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { createDepartment, updateDepartment, deleteDepartment } from './actions';

type Department = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  memberCount: number;
};

export function DepartmentsClient({ initial }: { initial: Department[] }) {
  const [editing, setEditing] = useState<Department | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createDepartment(formData);
      if (res?.ok) {
        setShowAdd(false);
      } else if (res?.error) {
        setError(res.error);
      }
    });
  }

  function submitUpdate(id: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateDepartment(id, formData);
      if (res?.ok) {
        setEditing(null);
      } else if (res?.error) {
        setError(res.error);
      }
    });
  }

  function submitDelete(id: string) {
    if (!confirm('Να διαγραφεί το τμήμα;')) return;
    startTransition(() => {
      deleteDepartment(id);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold">Τμήματα</h2>
        <Button variant="primary" size="md" icon={<Add20Filled />} onClick={() => { setShowAdd(true); setError(null); }}>
          Νέο τμήμα
        </Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5"
          >
            <DepartmentForm
              onCancel={() => setShowAdd(false)}
              onSubmit={submitCreate}
              pending={pending}
              error={error}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
        {initial.length === 0 && (
          <div className="p-8 text-center text-sm text-fluent-neutral-60">Δεν υπάρχουν τμήματα. Προσθέστε το πρώτο.</div>
        )}
        <div className="divide-y divide-black/5">
          {initial.map((d) => (
            <div key={d.id} className="p-4">
              {editing?.id === d.id ? (
                <DepartmentForm
                  initial={d}
                  onCancel={() => setEditing(null)}
                  onSubmit={(fd) => submitUpdate(d.id, fd)}
                  pending={pending}
                  error={error}
                />
              ) : (
                <div className="flex items-center gap-4">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: d.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-fluent-neutral-90">{d.name}</div>
                    {d.description && <div className="text-xs text-fluent-neutral-60 truncate mt-0.5">{d.description}</div>}
                  </div>
                  <span className="text-xs text-fluent-neutral-60">{d.memberCount} μέλη</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditing(d); setError(null); }}
                      className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
                      aria-label="Επεξεργασία"
                    >
                      <Edit20Regular className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => submitDelete(d.id)}
                      className="h-8 w-8 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-70"
                      aria-label="Διαγραφή"
                    >
                      <Delete20Regular className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DepartmentForm({
  initial,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  initial?: Department;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <form
      action={onSubmit}
      className="space-y-3"
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
        <input
          name="name"
          defaultValue={initial?.name}
          placeholder="Όνομα τμήματος"
          required
          minLength={2}
          className="h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-fluent-neutral-60">Χρώμα</label>
          <input
            type="color"
            name="color"
            defaultValue={initial?.color ?? '#0078D4'}
            className="h-10 w-14 rounded-md border border-fluent-neutral-20 cursor-pointer"
          />
        </div>
      </div>
      <textarea
        name="description"
        defaultValue={initial?.description ?? ''}
        placeholder="Περιγραφή (προαιρετικό)"
        rows={2}
        className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
      />
      {error && <div className="text-xs text-red-700">{error}</div>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          Ακύρωση
        </Button>
      </div>
    </form>
  );
}
