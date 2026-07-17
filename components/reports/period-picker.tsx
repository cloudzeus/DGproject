'use client';
import { useRef, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Checkmark16Filled, ChevronDown16Regular, Calendar20Regular } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import type { PeriodPreset } from '@/lib/reports/shared';

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Σήμερα' },
  { id: '7d', label: 'Τελευταίες 7 ημέρες' },
  { id: '30d', label: 'Τελευταίες 30 ημέρες' },
  { id: '90d', label: 'Τελευταίες 90 ημέρες' },
  { id: 'mtd', label: 'Τρέχων μήνας' },
];

export function PeriodPicker({ preset }: { preset: PeriodPreset | 'custom' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function go(next: URLSearchParams) {
    setOpen(false);
    router.push(`/reports?${next.toString()}`);
  }
  function pick(p: PeriodPreset) {
    const next = new URLSearchParams(params.toString());
    next.set('period', p); next.delete('from'); next.delete('to');
    go(next);
  }
  function applyCustom() {
    if (!from || !to) return;
    const next = new URLSearchParams(params.toString());
    next.set('from', from); next.set('to', to); next.delete('period');
    go(next);
  }

  const current = preset === 'custom' ? 'Προσαρμοσμένη' : PRESETS.find((p) => p.id === preset)?.label ?? '';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-fluent-neutral-20 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-4 shadow-fluent-2"
      >
        <Calendar20Regular className="text-fluent-neutral-60" />
        {current}
        <ChevronDown16Regular className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-64 rounded-lg bg-white shadow-fluent-16 border border-black/5 py-1 text-sm z-50">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={preset === p.id}
              onClick={() => pick(p.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-fluent-neutral-90 hover:bg-fluent-neutral-6"
            >
              <span className="w-4">{preset === p.id && <Checkmark16Filled className="h-4 w-4 text-fluent-blue-600" />}</span>
              {p.label}
            </button>
          ))}
          <div className="mt-1 pt-2 px-3 pb-2 border-t border-black/5">
            <p className="text-[11px] font-semibold text-fluent-neutral-60 mb-1.5">Προσαρμοσμένη περίοδος</p>
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="flex-1 h-8 px-1.5 rounded border border-fluent-neutral-20 text-xs" aria-label="Από" />
              <span className="text-fluent-neutral-50">–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="flex-1 h-8 px-1.5 rounded border border-fluent-neutral-20 text-xs" aria-label="Έως" />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!from || !to}
              className="mt-2 w-full h-8 rounded-md bg-fluent-blue-600 text-white text-xs font-semibold hover:bg-fluent-blue-700 disabled:opacity-40"
            >
              Εφαρμογή
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
