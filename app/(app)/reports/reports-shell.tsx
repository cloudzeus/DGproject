'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDownload20Regular } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { PeriodPicker } from '@/components/reports/period-picker';
import type { PeriodPreset } from '@/lib/reports/shared';

export type ReportTab = 'overview' | 'projects' | 'customers' | 'tasks' | 'tickets' | 'users';

const TABS: { id: ReportTab; label: string; privilegedOnly?: boolean }[] = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'projects', label: 'Έργα' },
  { id: 'customers', label: 'Πελάτες', privilegedOnly: true },
  { id: 'users', label: 'Παραγωγικότητα', privilegedOnly: true },
  { id: 'tasks', label: 'Tasks' },
  { id: 'tickets', label: 'Tickets', privilegedOnly: true },
];

export function ReportsShell({
  tab, preset, periodLabel, prevLabel, isPrivileged, children,
}: {
  tab: ReportTab;
  preset: PeriodPreset | 'custom';
  periodLabel: string;
  prevLabel: string;
  isPrivileged: boolean;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const tabHref = (t: ReportTab) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', t);
    return `/reports?${next.toString()}`;
  };
  const exportHref = `/api/reports/export?${new URLSearchParams({ ...Object.fromEntries(params.entries()), tab }).toString()}`;
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">Κέντρο αναφορών</h1>
          <p className="text-sm text-fluent-neutral-60 mt-1">Παραγωγικότητα, πελάτες, έργα και επιχειρησιακά KPI από τα πραγματικά δεδομένα λειτουργίας.</p>
          <p className="text-xs text-fluent-neutral-50 mt-1.5">{periodLabel} <span className="text-fluent-neutral-40">· σύγκριση με {prevLabel}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodPicker preset={preset} />
          <a href={exportHref} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-fluent-neutral-20 text-sm font-medium text-fluent-neutral-80 hover:bg-fluent-neutral-4 shadow-fluent-2">
            <ArrowDownload20Regular /> Εξαγωγή CSV
          </a>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-black/5 mb-6 overflow-x-auto" aria-label="Ενότητες αναφορών">
        {TABS.filter((t) => !t.privilegedOnly || isPrivileged).map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              'px-3 py-2 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors',
              tab === t.id ? 'border-fluent-blue-500 font-semibold text-fluent-neutral-95' : 'border-transparent text-fluent-neutral-40 hover:text-fluent-neutral-70 hover:bg-fluent-neutral-4/60 rounded-t',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
