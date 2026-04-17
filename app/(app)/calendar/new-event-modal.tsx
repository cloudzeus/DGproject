'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Dismiss20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { createMyCalendarEvent } from './actions';

interface Props {
  defaultDate?: string;
  onClose: () => void;
  onCreated: () => void;
}

function defaultStart(dateStr?: string): string {
  const d = dateStr ? new Date(`${dateStr}T09:00:00`) : new Date();
  if (!dateStr) {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHour(local: string): string {
  const d = new Date(local);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewEventModal({ defaultDate, onClose, onCreated }: Props) {
  const [isAllDay, setIsAllDay] = useState(false);
  const [start, setStart] = useState(() => defaultStart(defaultDate));
  const [end, setEnd] = useState(() => addHour(defaultStart(defaultDate)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createMyCalendarEvent(fd);
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        setError(res.error ?? 'Αποτυχία δημιουργίας.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white rounded-xl shadow-fluent-16 w-full max-w-lg"
      >
        <div className="flex items-center justify-between p-4 border-b border-black/5">
          <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">Νέο event</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>
        <form action={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Τίτλος</label>
            <input
              name="subject"
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
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Τοποθεσία</label>
            <input
              name="location"
              className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-fluent-neutral-80">
            <input
              type="checkbox"
              name="isAllDay"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Ολοήμερο
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Έναρξη</label>
              <input
                type={isAllDay ? 'date' : 'datetime-local'}
                name="start"
                value={isAllDay ? start.slice(0, 10) : start}
                onChange={(e) => setStart(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Λήξη</label>
              <input
                type={isAllDay ? 'date' : 'datetime-local'}
                name="end"
                value={isAllDay ? end.slice(0, 10) : end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={pending}>
              Ακύρωση
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? 'Δημιουργία…' : 'Δημιουργία'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
