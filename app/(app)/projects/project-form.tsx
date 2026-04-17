'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Dismiss20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';

type Status = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'planning', label: 'Σχεδιασμός' },
  { value: 'active', label: 'Ενεργό' },
  { value: 'on_hold', label: 'Σε αναμονή' },
  { value: 'completed', label: 'Ολοκληρωμένο' },
  { value: 'archived', label: 'Αρχειοθετημένο' },
];

const PRESET_COLORS = ['#0078D4', '#6264A7', '#107C41', '#C43E1C', '#7719AA', '#FF8C00', '#008272', '#B4009E'];

export type UserOption = { id: string; name: string; email: string };

export type ProjectFormInitial = {
  name: string;
  description: string | null;
  color: string;
  status: Status;
  dueDate: Date | null;
  ownerId: string;
  memberIds: string[];
};

export type ProjectFormResult = { ok: boolean; error?: string };

type Props = {
  users: UserOption[];
  initial?: ProjectFormInitial;
  onSubmit: (fd: FormData) => Promise<ProjectFormResult | void> | void;
  onCancel: () => void;
  submitLabel: string;
};

function toDateInputValue(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ProjectForm({ users, initial, onSubmit, onCancel, submitLabel }: Props) {
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0]);
  const [memberIds, setMemberIds] = useState<string[]>(initial?.memberIds ?? []);
  const [ownerId, setOwnerId] = useState<string>(initial?.ownerId ?? users[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(formData);
      if (res && !res.ok && res.error) setError(res.error);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Όνομα έργου</label>
        <input
          name="name"
          defaultValue={initial?.name ?? ''}
          required
          minLength={2}
          autoFocus
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Περιγραφή</label>
        <textarea
          name="description"
          defaultValue={initial?.description ?? ''}
          rows={3}
          className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Κατάσταση</label>
          <select
            name="status"
            defaultValue={initial?.status ?? 'planning'}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Ημερομηνία λήξης</label>
          <input
            type="date"
            name="dueDate"
            defaultValue={toDateInputValue(initial?.dueDate ?? null)}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1.5">Χρώμα</label>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full ring-2 transition-all ${color === c ? 'ring-fluent-neutral-90 scale-110' : 'ring-white'}`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-10 rounded-md border border-fluent-neutral-20 cursor-pointer"
            aria-label="Επιλογή χρώματος"
          />
        </div>
        <input type="hidden" name="color" value={color} />
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Ιδιοκτήτης</label>
        <select
          name="ownerId"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name || u.email}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1.5">Μέλη</label>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 rounded-md border border-fluent-neutral-20">
          {users.map((u) => {
            const active = memberIds.includes(u.id);
            const isOwner = u.id === ownerId;
            return (
              <button
                type="button"
                key={u.id}
                onClick={() => { if (!isOwner) toggleMember(u.id); }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1 ${
                  isOwner
                    ? 'bg-fluent-blue-50 text-fluent-blue-700 border-fluent-blue-200 cursor-default'
                    : active
                    ? 'bg-fluent-blue-600 text-white border-transparent'
                    : 'border-fluent-neutral-20 text-fluent-neutral-80 hover:bg-fluent-neutral-4'
                }`}
                title={isOwner ? 'Ιδιοκτήτης (αυτόματα μέλος)' : undefined}
              >
                {active && !isOwner && <Dismiss20Regular className="h-3 w-3" />}
                {u.name || u.email}
                {isOwner && <span className="text-[9px] uppercase">owner</span>}
              </button>
            );
          })}
        </div>
        {memberIds.map((id) => (
          <input key={id} type="hidden" name="memberIds" value={id} />
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">{error}</div>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={pending}>Ακύρωση</Button>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? 'Αποθήκευση…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function ProjectModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white rounded-xl shadow-fluent-16 w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-black/5 sticky top-0 bg-white z-10">
          <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">{title}</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}
