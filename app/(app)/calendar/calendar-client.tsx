'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import {
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Add16Filled,
  Warning20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NewEventModal } from './new-event-modal';
import { MonthView } from './views/month-view';
import { WeekView } from './views/week-view';
import { AgendaView } from './views/agenda-view';
import {
  addDays,
  startOfWeek,
  toISODate,
  type CalendarEvent,
  type CalendarTask,
  type CalendarView,
} from './views/shared';

export type { CalendarEvent, CalendarTask } from './views/shared';

interface Props {
  view: CalendarView;
  year: number;
  month: number;
  anchorDateISO: string;
  tasks: CalendarTask[];
  events: CalendarEvent[];
  outlookError: string | null;
  canCreate: boolean;
  m365Configured: boolean;
}

const VIEW_LABELS: { id: CalendarView; label: string }[] = [
  { id: 'month', label: 'Μήνας' },
  { id: 'week', label: 'Εβδομάδα' },
  { id: 'day', label: 'Ημέρα' },
  { id: 'agenda', label: 'Ατζέντα' },
];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function CalendarClient({
  view,
  year,
  month,
  anchorDateISO,
  tasks,
  events,
  outlookError,
  canCreate,
  m365Configured,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string | undefined>(undefined);
  const [, startTransition] = useTransition();

  const anchorDate = new Date(anchorDateISO);
  const current = new Date(year, month, 1);

  function buildUrl(nextView: CalendarView, payload: { year?: number; month?: number; date?: Date }) {
    const params = new URLSearchParams();
    params.set('view', nextView);
    if (nextView === 'month' || nextView === 'agenda') {
      const y = payload.year ?? year;
      const m = payload.month ?? month;
      params.set('m', monthKey(y, m));
    } else {
      const d = payload.date ?? anchorDate;
      params.set('d', toISODate(d));
    }
    return `/calendar?${params.toString()}`;
  }

  function changeView(nextView: CalendarView) {
    const anchor = view === 'month' || view === 'agenda' ? current : anchorDate;
    startTransition(() => {
      router.push(
        buildUrl(nextView, {
          year: anchor.getFullYear(),
          month: anchor.getMonth(),
          date: anchor,
        }),
      );
    });
  }

  function navigate(delta: number) {
    startTransition(() => {
      if (view === 'month' || view === 'agenda') {
        const next = new Date(year, month + delta, 1);
        router.push(buildUrl(view, { year: next.getFullYear(), month: next.getMonth() }));
      } else if (view === 'week') {
        router.push(buildUrl(view, { date: addDays(startOfWeek(anchorDate), delta * 7) }));
      } else {
        router.push(buildUrl(view, { date: addDays(anchorDate, delta) }));
      }
    });
  }

  function goToday() {
    const now = new Date();
    startTransition(() => {
      router.push(
        buildUrl(view, {
          year: now.getFullYear(),
          month: now.getMonth(),
          date: now,
        }),
      );
    });
  }

  function handleCellClick(d: Date) {
    if (!canCreate) return;
    setModalDate(toISODate(d));
    setModalOpen(true);
  }

  const title = (() => {
    if (view === 'month' || view === 'agenda') {
      return current.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      const start = startOfWeek(anchorDate);
      const end = addDays(start, 6);
      const sameMonth = start.getMonth() === end.getMonth();
      if (sameMonth) {
        return `${start.getDate()} – ${end.getDate()} ${start.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })}`;
      }
      return `${start.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return anchorDate.toLocaleDateString('el-GR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  })();

  const outlookBadgeHint = !m365Configured
    ? 'Το Microsoft integration δεν έχει ρυθμιστεί.'
    : canCreate
      ? null
      : 'Συνδέσου με Microsoft για να εμφανίζεται το Outlook calendar σου και να δημιουργείς events.';

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto h-[calc(100vh-56px)] flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">
            Calendar
          </h1>
          <p className="text-fluent-neutral-60 mt-1">
            {canCreate
              ? 'Task deadlines + Outlook events'
              : 'Task deadlines'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            icon={<Add16Filled />}
            onClick={() => {
              setModalDate(undefined);
              setModalOpen(true);
            }}
            disabled={!canCreate}
            title={outlookBadgeHint ?? undefined}
          >
            Νέο event
          </Button>
        </div>
      </div>

      {outlookBadgeHint && (
        <div className="mb-4 flex items-start gap-2 bg-fluent-blue-50 border border-fluent-blue-200 text-fluent-blue-800 px-3 py-2 rounded-md text-sm">
          <Warning20Regular className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{outlookBadgeHint}</span>
        </div>
      )}

      {outlookError && (
        <div className="mb-4 flex items-start gap-2 bg-orange-50 border border-orange-200 text-fluent-accent-orange px-3 py-2 rounded-md text-sm">
          <Warning20Regular className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Δεν ήταν δυνατή η ανάγνωση του Outlook calendar.</div>
            <div className="text-xs text-orange-800/80 mt-0.5">{outlookError}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-black/5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-display text-xl font-semibold truncate">{title}</h2>
            <div className="flex items-center gap-0.5 ml-2 shrink-0">
              <button
                onClick={() => navigate(-1)}
                className="h-8 w-8 rounded-md hover:bg-fluent-neutral-6 flex items-center justify-center text-fluent-neutral-70"
                aria-label="Προηγούμενο"
              >
                <ChevronLeft20Regular />
              </button>
              <button
                onClick={() => navigate(1)}
                className="h-8 w-8 rounded-md hover:bg-fluent-neutral-6 flex items-center justify-center text-fluent-neutral-70"
                aria-label="Επόμενο"
              >
                <ChevronRight20Regular />
              </button>
            </div>
            <Button variant="subtle" size="sm" onClick={goToday}>
              Σήμερα
            </Button>
          </div>
          <div className="flex gap-1 p-1 bg-fluent-neutral-6 rounded-lg shrink-0">
            {VIEW_LABELS.map((v) => (
              <button
                key={v.id}
                onClick={() => changeView(v.id)}
                className={cn(
                  'px-3 h-7 rounded-md text-sm font-medium transition-colors',
                  view === v.id
                    ? 'bg-white shadow-fluent-2 text-fluent-neutral-90'
                    : 'text-fluent-neutral-60 hover:text-fluent-neutral-80',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {view === 'month' && (
          <MonthView
            year={year}
            month={month}
            tasks={tasks}
            events={events}
            onCellClick={handleCellClick}
            canCreate={canCreate}
          />
        )}
        {view === 'week' && (
          <WeekView
            anchorDate={anchorDate}
            tasks={tasks}
            events={events}
            onCellClick={handleCellClick}
            canCreate={canCreate}
          />
        )}
        {view === 'day' && (
          <WeekView
            anchorDate={anchorDate}
            tasks={tasks}
            events={events}
            onCellClick={handleCellClick}
            canCreate={canCreate}
            singleDay
          />
        )}
        {view === 'agenda' && (
          <AgendaView
            tasks={tasks}
            events={events}
            canCreate={canCreate}
            onCreate={() => {
              setModalDate(undefined);
              setModalOpen(true);
            }}
          />
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <NewEventModal
            defaultDate={modalDate}
            onClose={() => setModalOpen(false)}
            onCreated={() => router.refresh()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
