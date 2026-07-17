'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDownload20Regular } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { PeriodPicker } from '@/components/reports/period-picker';
import type { PeriodPreset } from '@/lib/reports/shared';

export type ReportTab = 'overview' | 'projects' | 'tasks' | 'tickets' | 'users';

const TABS: { id: ReportTab; label: string; privilegedOnly?: boolean }[] = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'projects', label: 'Projects' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'tickets', label: 'Tickets', privilegedOnly: true },
  { id: 'users', label: 'Χρήστες', privilegedOnly: true },
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
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">Αναφορές</h1>
          <p className="text-sm text-fluent-neutral-60 mt-1">
            {periodLabel} <span className="text-fluent-neutral-40">· σύγκριση με {prevLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodPicker preset={preset} />
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-fluent-neutral-20 text-sm font-medium text-fluent-neutral-80 hover:bg-fluent-neutral-4 shadow-fluent-2"
          >
            <ArrowDownload20Regular /> Εξαγωγή
          </a>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-black/5 mb-6" aria-label="Ενότητες αναφορών">
        {TABS.filter((t) => !t.privilegedOnly || isPrivileged).map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              'px-3 py-2 -mb-px text-sm border-b-2 transition-colors',
              tab === t.id
                ? 'border-fluent-blue-500 font-semibold text-fluent-neutral-95'
                : 'border-transparent text-fluent-neutral-40 hover:text-fluent-neutral-70 hover:bg-fluent-neutral-4/60 rounded-t',
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
