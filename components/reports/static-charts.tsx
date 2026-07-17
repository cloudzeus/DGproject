'use client';
import { SINGLE_SERIES } from '@/lib/reports/chart-theme';

/**
 * Οριζόντιες μπάρες σύγκρισης κατηγοριών (αντί για pie). Μία σειρά ⇒ ένα χρώμα.
 * Direct labels: όνομα αριστερά, τιμή δεξιά — δεν χρειάζεται legend/tooltip.
 */
export function HBarList({ items, color = SINGLE_SERIES, maxItems = 8 }: {
  items: { label: string; value: number; color?: string }[];
  color?: string;
  maxItems?: number;
}) {
  const shown = items.slice(0, maxItems);
  const rest = items.slice(maxItems);
  const restSum = rest.reduce((a, b) => a + b.value, 0);
  const rows = restSum > 0 ? [...shown, { label: `Άλλο (${rest.length})`, value: restSum, color: '#8A8A8A' }] : shown;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(90px,1fr)_2fr_auto] items-center gap-2 text-xs">
          <span className="text-fluent-neutral-70 truncate" title={r.label}>{r.label}</span>
          <span className="h-4 rounded-r bg-fluent-neutral-6 overflow-hidden">
            <span
              className="block h-full rounded-r"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color, minWidth: r.value > 0 ? 3 : 0 }}
            />
          </span>
          <span className="tabular-nums font-semibold text-fluent-neutral-80 w-8 text-right">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** 100% stacked μπάρα μίας γραμμής με 2px gaps και legend από κάτω. */
export function StackedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  if (total === 0) return null;
  return (
    <div>
      <div className="flex h-5 rounded overflow-hidden gap-[2px]">
        {visible.map((s) => (
          <span key={s.label} title={`${s.label}: ${s.value}`} style={{ background: s.color, width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {visible.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-fluent-neutral-70">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="tabular-nums font-semibold">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
