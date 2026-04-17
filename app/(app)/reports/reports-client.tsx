'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  DataBarVertical20Regular,
  People20Regular,
  TaskListLtr20Regular,
  Warning16Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { cn, statusLabel } from '@/lib/utils';
import type { ReportsData, ReportProjectRow, ReportUserRow } from '@/lib/reports';
import { ArrowDownload20Regular } from '@fluentui/react-icons';

type ProjectRow = ReportProjectRow;
type UserRow = ReportUserRow;

export type { ReportsData };

type Tab = 'overview' | 'projects' | 'users';

const TABS: { id: Tab; label: string; Icon: typeof DataBarVertical20Regular }[] = [
  { id: 'overview', label: 'Επισκόπηση', Icon: DataBarVertical20Regular },
  { id: 'projects', label: 'Έργα', Icon: TaskListLtr20Regular },
  { id: 'users', label: 'Χρήστες', Icon: People20Regular },
];

const STATUS_COLORS: Record<string, string> = {
  backlog: '#8A8A8A',
  todo: '#0078D4',
  in_progress: '#D83B01',
  review: '#8764B8',
  done: '#107C10',
  planning: '#0078D4',
  active: '#107C10',
  on_hold: '#D83B01',
  completed: '#5C5C5C',
  archived: '#3C3C3C',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#8A8A8A',
  medium: '#0078D4',
  high: '#D83B01',
  urgent: '#C50F1F',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Χαμηλή',
  medium: 'Μεσαία',
  high: 'Υψηλή',
  urgent: 'Επείγουσα',
};

export function ReportsClient({ data }: { data: ReportsData }) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">
            Αναφορές
          </h1>
          <p className="text-fluent-neutral-60 mt-1">
            Στατιστικά και προόδος έργων, εργασιών και ομάδας
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/reports/export?format=xlsx&tab=${tab}`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[#107C41] text-white text-sm font-semibold hover:bg-[#0d6435] transition-colors shadow-fluent-2"
          >
            <ArrowDownload20Regular className="h-4 w-4" />
            Excel
          </a>
          <a
            href={`/api/reports/export?format=docx&tab=${tab}`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[#185ABD] text-white text-sm font-semibold hover:bg-[#134894] transition-colors shadow-fluent-2"
          >
            <ArrowDownload20Regular className="h-4 w-4" />
            Word
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Έργα" value={data.totals.projects} color="#0078D4" />
        <StatCard label="Συνολικές εργασίες" value={data.totals.tasks} color="#8764B8" />
        <StatCard label="Ολοκληρωμένες" value={data.totals.completed} color="#107C10" />
        <StatCard
          label="Εκπρόθεσμες"
          value={data.totals.overdue}
          color="#D83B01"
          alert={data.totals.overdue > 0}
        />
      </div>

      <div className="flex gap-1 p-1 bg-white rounded-lg border border-black/5 shadow-fluent-2 w-fit mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-3 h-8 rounded-md text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-fluent-blue-50 text-fluent-blue-700'
                : 'text-fluent-neutral-70 hover:bg-fluent-neutral-6',
            )}
          >
            <t.Icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === 'overview' && <OverviewTab data={data} />}
        {tab === 'projects' && <ProjectsTab rows={data.projects} />}
        {tab === 'users' && <UsersTab rows={data.users} />}
      </motion.div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  alert,
}: {
  label: string;
  value: number;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-black/5 p-5 shadow-fluent-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60">
          {label}
        </span>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      </div>
      <div
        className={cn(
          'text-3xl font-semibold font-display tracking-tight',
          alert ? 'text-fluent-accent-red' : 'text-fluent-neutral-95',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: ReportsData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <BreakdownCard
        title="Κατανομή εργασιών ανά κατάσταση"
        entries={Object.entries(data.statusBreakdown).map(([key, count]) => ({
          key,
          label: statusLabel(key),
          count,
          color: STATUS_COLORS[key] ?? '#888',
        }))}
      />
      <BreakdownCard
        title="Κατανομή εργασιών ανά προτεραιότητα"
        entries={Object.entries(data.priorityBreakdown).map(([key, count]) => ({
          key,
          label: PRIORITY_LABEL[key] ?? key,
          count,
          color: PRIORITY_COLORS[key] ?? '#888',
        }))}
      />
      <BreakdownCard
        title="Έργα ανά κατάσταση"
        entries={Object.entries(data.projectStatusBreakdown).map(([key, count]) => ({
          key,
          label: statusLabel(key),
          count,
          color: STATUS_COLORS[key] ?? '#888',
        }))}
      />
      <TopListCard
        title="Χρήστες με τις περισσότερες ανοιχτές εργασίες"
        users={data.users.filter((u) => u.open > 0).slice(0, 5)}
      />
    </div>
  );
}

function BreakdownCard({
  title,
  entries,
}: {
  title: string;
  entries: Array<{ key: string; label: string; count: number; color: string }>;
}) {
  const max = Math.max(1, ...entries.map((e) => e.count));
  const total = entries.reduce((a, b) => a + b.count, 0);

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5">
      <h3 className="font-display font-semibold text-fluent-neutral-95 mb-4">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-fluent-neutral-50">Δεν υπάρχουν δεδομένα.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const widthPct = (e.count / max) * 100;
            return (
              <div key={e.key}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <span className="flex items-center gap-2 text-fluent-neutral-80">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: e.color }}
                    />
                    {e.label}
                  </span>
                  <span className="font-semibold text-fluent-neutral-90 tabular-nums">
                    {e.count}
                  </span>
                </div>
                <div className="h-2 bg-fluent-neutral-8 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{ duration: 0.6, ease: [0.33, 0, 0.67, 1] }}
                    className="h-full rounded-full"
                    style={{ background: e.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopListCard({ title, users }: { title: string; users: UserRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5">
      <h3 className="font-display font-semibold text-fluent-neutral-95 mb-4">{title}</h3>
      {users.length === 0 ? (
        <p className="text-sm text-fluent-neutral-50">Καμία ανοιχτή εργασία.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-fluent-neutral-4"
            >
              <Avatar user={{ name: u.name, avatarUrl: u.avatarUrl }} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-fluent-neutral-90 truncate">{u.name}</p>
                <p className="text-[11px] text-fluent-neutral-60 truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-fluent-neutral-70">
                  <span className="font-semibold text-fluent-neutral-90">{u.open}</span> ανοιχτές
                </span>
                {u.overdue > 0 && (
                  <span className="inline-flex items-center gap-1 text-fluent-accent-red font-semibold">
                    <Warning16Regular className="h-3 w-3" />
                    {u.overdue}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsTab({ rows }: { rows: ProjectRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-10 text-center text-sm text-fluent-neutral-60">
        Δεν υπάρχουν έργα.
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="grid grid-cols-[1fr_120px_100px_80px_80px_80px_120px] gap-3 px-5 h-10 items-center text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-50 border-b border-black/5 bg-fluent-neutral-4">
        <span>Έργο</span>
        <span>Κατάσταση</span>
        <span className="text-right">Πρόοδος</span>
        <span className="text-right">Σύνολο</span>
        <span className="text-right">Done</span>
        <span className="text-right">Εκπρόθεσμες</span>
        <span>Ιδιοκτήτης</span>
      </div>
      {rows.map((p, i) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.02 }}
          className="grid grid-cols-[1fr_120px_100px_80px_80px_80px_120px] gap-3 px-5 h-14 items-center border-b border-black/5 last:border-0 hover:bg-fluent-neutral-4 transition-colors"
        >
          <Link
            href={`/projects/${p.id}`}
            className="flex items-center gap-2.5 min-w-0 hover:text-fluent-blue-700"
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-sm font-medium text-fluent-neutral-90 truncate">{p.name}</span>
          </Link>
          <span
            className="text-xs px-2 py-1 rounded-full text-white inline-flex items-center justify-center w-fit"
            style={{ background: STATUS_COLORS[p.status] ?? '#888' }}
          >
            {statusLabel(p.status)}
          </span>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-fluent-neutral-8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${p.completionPct}%`, background: p.color }}
              />
            </div>
            <span className="text-xs font-semibold text-fluent-neutral-90 tabular-nums w-8 text-right">
              {p.completionPct}%
            </span>
          </div>
          <span className="text-sm text-fluent-neutral-90 tabular-nums text-right">{p.total}</span>
          <span className="text-sm text-fluent-accent-green font-semibold tabular-nums text-right">
            {p.done}
          </span>
          <span
            className={cn(
              'text-sm tabular-nums text-right',
              p.overdue > 0 ? 'text-fluent-accent-red font-semibold' : 'text-fluent-neutral-60',
            )}
          >
            {p.overdue}
          </span>
          <span className="text-xs text-fluent-neutral-70 truncate">{p.ownerName}</span>
        </motion.div>
      ))}
    </div>
  );
}

function UsersTab({ rows }: { rows: UserRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-10 text-center text-sm text-fluent-neutral-60">
        Δεν υπάρχουν χρήστες.
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="grid grid-cols-[1fr_90px_90px_90px_90px_90px] gap-3 px-5 h-10 items-center text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-50 border-b border-black/5 bg-fluent-neutral-4">
        <span>Χρήστης</span>
        <span className="text-right">Σύνολο</span>
        <span className="text-right">Ανοιχτές</span>
        <span className="text-right">Σε εξέλιξη</span>
        <span className="text-right">Ολοκληρωμ.</span>
        <span className="text-right">Εκπρόθεσμες</span>
      </div>
      {rows.map((u, i) => (
        <motion.div
          key={u.id}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.02 }}
          className="grid grid-cols-[1fr_90px_90px_90px_90px_90px] gap-3 px-5 h-14 items-center border-b border-black/5 last:border-0 hover:bg-fluent-neutral-4 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Avatar user={{ name: u.name, avatarUrl: u.avatarUrl }} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-fluent-neutral-90 truncate">{u.name}</p>
              <p className="text-[11px] text-fluent-neutral-60 truncate">{u.email}</p>
            </div>
          </div>
          <span className="text-sm text-fluent-neutral-90 tabular-nums text-right">{u.total}</span>
          <span className="text-sm text-fluent-neutral-90 tabular-nums text-right">{u.open}</span>
          <span className="text-sm text-fluent-accent-orange font-semibold tabular-nums text-right">
            {u.inProgress}
          </span>
          <span className="text-sm text-fluent-accent-green font-semibold tabular-nums text-right">
            {u.done}
          </span>
          <span
            className={cn(
              'text-sm tabular-nums text-right',
              u.overdue > 0 ? 'text-fluent-accent-red font-semibold' : 'text-fluent-neutral-60',
            )}
          >
            {u.overdue}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
