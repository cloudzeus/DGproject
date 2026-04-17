'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

type Role = 'admin' | 'manager' | 'member' | 'viewer';
type LoadLevel = 'available' | 'moderate' | 'busy' | 'overloaded';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  departments: Array<{ id: string; name: string; color: string }>;
  projects: Array<{ id: string; name: string; color: string; status: string }>;
  openTaskCount: number;
  doneTaskCount: number;
  overdueCount: number;
  remainingHours: number;
  loadPct: number;
  loadLevel: LoadLevel;
  upcoming: Array<{
    id: string;
    title: string;
    dueDate: Date | string;
    projectName: string;
    projectColor: string;
    estimatedHours: number | null;
  }>;
};

const ROLE_VARIANT: Record<Role, 'red' | 'orange' | 'blue' | 'neutral'> = {
  admin: 'red',
  manager: 'orange',
  member: 'blue',
  viewer: 'neutral',
};
const ROLE_LABEL: Record<Role, string> = {
  admin: 'Διαχειριστής',
  manager: 'Διευθυντής',
  member: 'Μέλος',
  viewer: 'Προβολή',
};

const LOAD_COLOR: Record<LoadLevel, string> = {
  available: 'bg-fluent-accent-green',
  moderate: 'bg-fluent-blue-500',
  busy: 'bg-fluent-accent-orange',
  overloaded: 'bg-fluent-accent-red',
};
const LOAD_LABEL: Record<LoadLevel, string> = {
  available: 'Διαθέσιμος',
  moderate: 'Μέτριος φόρτος',
  busy: 'Απασχολημένος',
  overloaded: 'Υπερφορτωμένος',
};

export function TeamClient({ users, weeklyCapacity }: { users: TeamMember[]; weeklyCapacity: number }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LoadLevel | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== 'all' && u.loadLevel !== filter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.departments.some((d) => d.name.toLowerCase().includes(q))
      );
    });
  }, [users, query, filter]);

  const totals = useMemo(() => {
    const remaining = users.reduce((s, u) => s + u.remainingHours, 0);
    const overdue = users.reduce((s, u) => s + u.overdueCount, 0);
    const overloaded = users.filter((u) => u.loadLevel === 'overloaded' || u.loadLevel === 'busy').length;
    return {
      remaining: Math.round(remaining * 100) / 100,
      overdue,
      overloaded,
      capacity: users.length * weeklyCapacity,
    };
  }, [users, weeklyCapacity]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard label="Συνολικές ώρες ανατεθειμένες" value={`${totals.remaining}h`} />
        <SummaryCard label="Εβδομαδιαία χωρητικότητα" value={`${totals.capacity}h`} />
        <SummaryCard label="Απασχολ/Υπερφορτωμ" value={String(totals.overloaded)} />
        <SummaryCard label="Εκπρόθεσμες εργασίες" value={String(totals.overdue)} tone={totals.overdue > 0 ? 'warn' : 'default'} />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση ονόματος, email, τμήματος…"
            className="w-full h-10 pl-10 pr-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-md border border-fluent-neutral-20 p-1">
          {(['all', 'available', 'moderate', 'busy', 'overloaded'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 h-8 rounded ${filter === f ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-70 hover:bg-fluent-neutral-4'}`}
            >
              {f === 'all' ? 'Όλοι' : LOAD_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((u, i) => (
          <motion.div
            key={u.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            className="bg-white rounded-xl border border-black/5 shadow-fluent-2 hover:shadow-fluent-8 transition-all overflow-hidden flex flex-col"
          >
            <div className="px-5 pt-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar user={{ name: u.name || u.email, avatarUrl: u.image ?? undefined }} size="md" showPresence />
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-fluent-neutral-95 truncate">{u.name || u.email}</h3>
                  <p className="text-xs text-fluent-neutral-60 truncate">{u.email}</p>
                </div>
              </div>
              <Badge variant={ROLE_VARIANT[u.role]}>{ROLE_LABEL[u.role]}</Badge>
            </div>

            {u.departments.length > 0 && (
              <div className="px-5 mt-3 flex flex-wrap gap-1">
                {u.departments.map((d) => (
                  <span key={d.id} className="text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: d.color }}>
                    {d.name}
                  </span>
                ))}
              </div>
            )}

            <div className="px-5 mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-fluent-neutral-70">{LOAD_LABEL[u.loadLevel]}</span>
                <span className="text-xs text-fluent-neutral-60 tabular-nums">{u.remainingHours}h / {weeklyCapacity}h</span>
              </div>
              <div className="h-2 rounded-full bg-fluent-neutral-4 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${LOAD_COLOR[u.loadLevel]}`}
                  style={{ width: `${Math.min(100, u.loadPct)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 px-5 mt-4 py-3 border-y border-black/5">
              <Stat num={u.openTaskCount} label="Ανοιχτές" />
              <Stat num={u.doneTaskCount} label="Ολοκλ." />
              <Stat num={u.overdueCount} label="Εκπρόθ." tone={u.overdueCount > 0 ? 'warn' : 'default'} />
            </div>

            <div className="px-5 py-4 flex-1">
              <p className="text-[11px] uppercase tracking-wider text-fluent-neutral-50 mb-2">Έργα ({u.projects.length})</p>
              {u.projects.length === 0 ? (
                <p className="text-xs text-fluent-neutral-60">Δεν συμμετέχει σε έργο.</p>
              ) : (
                <div className="flex flex-wrap gap-1 mb-3">
                  {u.projects.slice(0, 4).map((p) => (
                    <span key={p.id} className="text-[11px] inline-flex items-center gap-1 bg-fluent-neutral-4 px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                      {p.name}
                    </span>
                  ))}
                  {u.projects.length > 4 && (
                    <span className="text-[11px] text-fluent-neutral-60">+{u.projects.length - 4}</span>
                  )}
                </div>
              )}

              {u.upcoming.length > 0 && (
                <>
                  <p className="text-[11px] uppercase tracking-wider text-fluent-neutral-50 mb-1.5 mt-2">Επόμενες προθεσμίες</p>
                  <ul className="space-y-1">
                    {u.upcoming.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: t.projectColor }} />
                        <span className="flex-1 truncate text-fluent-neutral-80">{t.title}</span>
                        <span className="text-fluent-neutral-60">{formatDate(t.dueDate)}</span>
                        {t.estimatedHours !== null && (
                          <span className="text-fluent-neutral-60 tabular-nums w-10 text-right">{t.estimatedHours}h</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-10 text-center text-sm text-fluent-neutral-60">
          Δεν βρέθηκε κανένας χρήστης με αυτά τα κριτήρια.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' }) {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
      <div className="text-[11px] uppercase tracking-wider text-fluent-neutral-50">{label}</div>
      <div className={`text-2xl font-semibold font-display mt-0.5 tabular-nums ${tone === 'warn' ? 'text-fluent-accent-red' : 'text-fluent-neutral-95'}`}>{value}</div>
    </div>
  );
}

function Stat({ num, label, tone = 'default' }: { num: number; label: string; tone?: 'default' | 'warn' }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-semibold font-display tabular-nums ${tone === 'warn' && num > 0 ? 'text-fluent-accent-red' : 'text-fluent-neutral-95'}`}>{num}</div>
      <div className="text-[10px] uppercase tracking-wider text-fluent-neutral-60">{label}</div>
    </div>
  );
}
