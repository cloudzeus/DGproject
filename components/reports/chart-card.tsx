'use client';
import { useState } from 'react';
import { Table20Regular, DataArea20Regular } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';

/**
 * Wrapper κάθε γραφήματος: τίτλος, empty state, toggle «Γράφημα/Πίνακας».
 * `table`: rows για το table view (accessibility) — όταν λείπει δεν εμφανίζεται toggle.
 * `empty`: true ⇒ δείχνει λεκτικό αντί για άδειους άξονες.
 */
export function ChartCard({
  title, subtitle, empty, emptyText = 'Κανένα δεδομένο στην περίοδο.', table, children,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  emptyText?: string;
  table?: { headers: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-fluent-neutral-90">{title}</h3>
          {subtitle && <p className="text-[11px] text-fluent-neutral-50 mt-0.5">{subtitle}</p>}
        </div>
        {table && !empty && (
          <button
            type="button"
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
            aria-label={view === 'chart' ? 'Προβολή πίνακα' : 'Προβολή γραφήματος'}
            title={view === 'chart' ? 'Πίνακας' : 'Γράφημα'}
            className="h-7 w-7 rounded-md text-fluent-neutral-60 hover:bg-fluent-neutral-6 flex items-center justify-center shrink-0"
          >
            {view === 'chart' ? <Table20Regular /> : <DataArea20Regular />}
          </button>
        )}
      </div>
      {empty ? (
        <p className="py-10 text-center text-sm text-fluent-neutral-50">{emptyText}</p>
      ) : view === 'table' && table ? (
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-fluent-neutral-60 border-b border-black/5">
                {table.headers.map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-black/[0.03] last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className={cn('py-1.5 pr-3', j > 0 && 'tabular-nums')}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
