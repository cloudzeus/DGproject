'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarLtr20Regular,
  CheckmarkCircle20Filled,
  Document20Regular,
  Open20Regular,
  Person20Regular,
  Search20Regular,
  Sparkle20Regular,
  Warning20Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';

export type ProjectMeeting = {
  id: string;
  subject: string;
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  summary: string | null;
  decisions: unknown[] | null;
  actionItems: unknown[] | null;
  risks: unknown[] | null;
  openQuestions: unknown[] | null;
  status: 'scheduled' | 'pending' | 'processing' | 'ready' | 'failed';
  autoTasksCreated: number;
  autoTasksNeedReview: number;
  llmProvider: string | null;
  llmModel: string | null;
  llmDurationMs: number | null;
  teamsJoinUrl: string | null;
  hasTranscript: boolean;
  processedAt: Date | null;
  createdAt: Date;
  organizer: { id: string; name: string; email: string; avatarUrl?: string };
  momDeliveries: Array<{
    id: string;
    status: string;
    recipientEmail: string;
    openedAt: Date | null;
    deliveredAt: Date | null;
  }>;
};

type Filter = 'all' | 'ready' | 'pending' | 'with-transcript';

export function ProjectMeetingsTab({
  projectId,
  meetings,
}: {
  projectId: string;
  meetings: ProjectMeeting[];
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const stats = useMemo(() => {
    let totalSec = 0;
    let tasks = 0;
    let needReview = 0;
    let withTranscript = 0;
    let actionItems = 0;
    let decisions = 0;
    let risks = 0;
    let openQuestions = 0;
    for (const m of meetings) {
      totalSec += m.durationSec;
      tasks += m.autoTasksCreated;
      needReview += m.autoTasksNeedReview;
      if (m.hasTranscript) withTranscript += 1;
      if (Array.isArray(m.actionItems)) actionItems += m.actionItems.length;
      if (Array.isArray(m.decisions)) decisions += m.decisions.length;
      if (Array.isArray(m.risks)) risks += m.risks.length;
      if (Array.isArray(m.openQuestions)) openQuestions += m.openQuestions.length;
    }
    return {
      count: meetings.length,
      totalHours: totalSec / 3600,
      tasks,
      needReview,
      withTranscript,
      actionItems,
      decisions,
      risks,
      openQuestions,
    };
  }, [meetings]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return meetings.filter((m) => {
      if (filter === 'ready' && m.status !== 'ready') return false;
      if (filter === 'pending' && (m.status === 'ready' || m.status === 'failed')) return false;
      if (filter === 'with-transcript' && !m.hasTranscript) return false;
      if (s) {
        const hay = (m.subject + ' ' + (m.summary ?? '') + ' ' + m.organizer.name).toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [meetings, filter, search]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-fluent-blue-50 flex items-center justify-center">
            <CalendarLtr20Regular className="h-5 w-5 text-fluent-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fluent-neutral-90 leading-tight">
              Συναντήσεις & Πρακτικά
            </h2>
            <p className="text-xs text-fluent-neutral-60">
              Αποδελτιωμένα Microsoft Teams meetings — με αυτόματη δημιουργία tasks από LLM.
            </p>
          </div>
        </div>
        <Link
          href={`/projects/${projectId}/meetings`}
          className="text-xs text-fluent-blue-700 hover:text-fluent-blue-800 font-semibold inline-flex items-center gap-1.5 self-center"
        >
          <Open20Regular className="h-4 w-4" />
          Νέα αποδελτίωση από VTT
        </Link>
      </header>

      {/* Aggregate stats */}
      {meetings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Συσκέψεις" value={String(stats.count)} sub={`${stats.withTranscript} με transcript`} />
          <StatTile label="Συνολικός χρόνος" value={formatHours(stats.totalHours)} />
          <StatTile
            label="Auto-tasks"
            value={String(stats.tasks)}
            sub={stats.needReview > 0 ? `${stats.needReview} χρειάζονται review` : 'όλα verified'}
            tone={stats.needReview > 0 ? 'warn' : 'neutral'}
          />
          <StatTile
            label="LLM insights"
            value={String(stats.actionItems + stats.decisions + stats.risks + stats.openQuestions)}
            sub={`${stats.decisions} αποφάσεις · ${stats.risks} risks · ${stats.openQuestions} εκκρεμή`}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center bg-fluent-neutral-4 rounded-lg p-1">
          {(['all', 'ready', 'pending', 'with-transcript'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs h-7 px-3 rounded-md font-medium transition-colors ${
                filter === f
                  ? 'bg-white text-fluent-blue-700 shadow-fluent-2'
                  : 'text-fluent-neutral-70 hover:bg-white/60'
              }`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="ml-auto relative w-full sm:w-72">
          <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fluent-neutral-50" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Αναζήτηση…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        meetings.length === 0 ? (
          <EmptyMeetings projectId={projectId} />
        ) : (
          <div className="rounded-xl border border-fluent-neutral-10 bg-white px-4 py-6 text-center">
            <p className="text-sm text-fluent-neutral-70 font-medium">
              Καμία σύσκεψη με αυτά τα φίλτρα.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {visible.map((m) => (
              <MeetingRow key={m.id} projectId={projectId} meeting={m} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Όλες',
  ready: 'Επεξεργασμένες',
  pending: 'Σε επεξεργασία',
  'with-transcript': 'Με transcript',
};

function MeetingRow({
  projectId,
  meeting,
}: {
  projectId: string;
  meeting: ProjectMeeting;
}) {
  const [open, setOpen] = useState(false);
  const decisionsCount = Array.isArray(meeting.decisions) ? meeting.decisions.length : 0;
  const actionItemsCount = Array.isArray(meeting.actionItems) ? meeting.actionItems.length : 0;
  const risksCount = Array.isArray(meeting.risks) ? meeting.risks.length : 0;
  const openQuestionsCount = Array.isArray(meeting.openQuestions) ? meeting.openQuestions.length : 0;

  const momSent = meeting.momDeliveries.length;
  const momOpened = meeting.momDeliveries.filter((d) => d.openedAt).length;

  return (
    <motion.article
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-fluent-neutral-10 shadow-fluent-2 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-4 py-3 hover:bg-fluent-neutral-4 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <StatusBadge status={meeting.status} />
              {meeting.llmProvider && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-fluent-blue-100 text-fluent-blue-700">
                  <Sparkle20Regular className="h-3 w-3" />
                  {meeting.llmProvider}
                  {meeting.llmModel && ` · ${meeting.llmModel}`}
                </span>
              )}
              {meeting.hasTranscript && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-fluent-neutral-8 text-fluent-neutral-70">
                  <Document20Regular className="h-3 w-3" />
                  Transcript
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-fluent-neutral-90 truncate">
              {meeting.subject}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-fluent-neutral-60 flex-wrap">
              <CalendarLtr20Regular className="h-3.5 w-3.5" />
              <span>{formatDateTime(meeting.startedAt)}</span>
              <span>·</span>
              <span>{Math.round(meeting.durationSec / 60)}′</span>
              <span>·</span>
              <Avatar
                user={{ name: meeting.organizer.name, avatarUrl: meeting.organizer.avatarUrl }}
                size="xs"
              />
              <span className="truncate max-w-[140px]">{meeting.organizer.name}</span>
            </div>
            {meeting.summary && (
              <p className="mt-2 text-sm text-fluent-neutral-80 line-clamp-2">{meeting.summary}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0 text-[11px]">
            {meeting.autoTasksCreated > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-fluent-accent-green/10 text-fluent-accent-green font-semibold">
                <CheckmarkCircle20Filled className="h-3 w-3" />
                +{meeting.autoTasksCreated} task{meeting.autoTasksCreated === 1 ? '' : 's'}
              </span>
            )}
            {meeting.autoTasksNeedReview > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-fluent-accent-orange/10 text-fluent-accent-orange font-semibold">
                <Warning20Regular className="h-3 w-3" />
                {meeting.autoTasksNeedReview} review
              </span>
            )}
            {momSent > 0 && (
              <span className="text-[10px] text-fluent-neutral-60 tabular-nums">
                MoM: {momOpened}/{momSent} opened
              </span>
            )}
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-fluent-neutral-10"
          >
            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <InsightTile
                label="Αποφάσεις"
                value={decisionsCount}
                tone="info"
              />
              <InsightTile
                label="Action items"
                value={actionItemsCount}
                tone="success"
              />
              <InsightTile
                label="Risks"
                value={risksCount}
                tone={risksCount > 0 ? 'warn' : 'neutral'}
              />
              <InsightTile
                label="Open questions"
                value={openQuestionsCount}
                tone={openQuestionsCount > 0 ? 'warn' : 'neutral'}
              />
            </div>
            <div className="px-4 pb-3 flex items-center justify-end gap-2">
              <Link
                href={`/projects/${projectId}/meetings/${meeting.id}`}
                className="text-xs h-8 px-3 rounded-md bg-fluent-blue-500 text-white hover:bg-fluent-blue-600 inline-flex items-center gap-1.5 font-semibold"
              >
                <Open20Regular className="h-4 w-4" />
                Άνοιγμα πρακτικού
              </Link>
              {meeting.teamsJoinUrl && (
                <a
                  href={meeting.teamsJoinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs h-8 px-3 rounded-md border border-fluent-neutral-20 hover:bg-fluent-neutral-4 inline-flex items-center gap-1.5 font-medium text-fluent-neutral-80"
                >
                  Σύνδεσμος Teams
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function StatusBadge({ status }: { status: ProjectMeeting['status'] }) {
  const cfg: Record<ProjectMeeting['status'], { label: string; cls: string }> = {
    scheduled: { label: 'Προγραμματισμένη', cls: 'bg-fluent-neutral-8 text-fluent-neutral-70' },
    pending: { label: 'Σε αναμονή', cls: 'bg-fluent-neutral-8 text-fluent-neutral-70' },
    processing: { label: 'Επεξεργασία…', cls: 'bg-fluent-blue-100 text-fluent-blue-700' },
    ready: { label: 'Έτοιμη', cls: 'bg-fluent-accent-green/10 text-fluent-accent-green' },
    failed: { label: 'Σφάλμα', cls: 'bg-fluent-accent-red/10 text-fluent-accent-red' },
  };
  const c = cfg[status];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${c.cls}`}>
      {c.label}
    </span>
  );
}

function InsightTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'info' | 'success' | 'warn' | 'neutral';
}) {
  const toneCls: Record<typeof tone, string> = {
    info: 'bg-fluent-blue-50 text-fluent-blue-700',
    success: 'bg-fluent-accent-green/10 text-fluent-accent-green',
    warn: 'bg-fluent-accent-orange/10 text-fluent-accent-orange',
    neutral: 'bg-fluent-neutral-4 text-fluent-neutral-70',
  };
  return (
    <div className={`rounded-lg px-3 py-2 ${toneCls[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-semibold font-display tabular-nums">{value}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warn' | 'neutral';
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        tone === 'warn'
          ? 'bg-fluent-accent-orange/8 border-fluent-accent-orange/30'
          : 'bg-white border-black/5 shadow-fluent-2'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-fluent-neutral-50 font-semibold">
        {label}
      </div>
      <div className="text-xl font-semibold font-display tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-fluent-neutral-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyMeetings({ projectId }: { projectId: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-fluent-neutral-20 px-6 py-12 text-center bg-white">
      <CalendarLtr20Regular className="h-10 w-10 mx-auto text-fluent-neutral-40 mb-3" />
      <p className="text-sm font-semibold text-fluent-neutral-90">Καμία αποδελτιωμένη σύσκεψη ακόμη</p>
      <p className="text-xs text-fluent-neutral-60 mt-1 max-w-md mx-auto">
        Όταν αναθέσεις μια αποδελτίωση Teams σε αυτό το έργο, θα εμφανίζεται εδώ μαζί με τα LLM
        insights (decisions, action items, risks, open questions) και τα auto-generated tasks.
      </p>
      <Link
        href={`/projects/${projectId}/meetings`}
        className="inline-flex items-center gap-1.5 mt-4 text-xs h-9 px-4 rounded-md bg-fluent-blue-500 text-white font-semibold hover:bg-fluent-blue-600"
      >
        <Open20Regular className="h-4 w-4" />
        Νέα αποδελτίωση από VTT
      </Link>
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}′`;
  return `${h.toFixed(1)}h`;
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
