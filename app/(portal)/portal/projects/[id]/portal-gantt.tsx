'use client';

import { useMemo, useState } from 'react';
import { Gantt, type GanttRow, type GanttTask } from '@/components/gantt/gantt';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { PortalTask } from './portal-project-client';

const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' });
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Δεν ξεκίνησε',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Σε έλεγχο',
  done: 'Ολοκληρώθηκε',
};
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Χαμηλή',
  medium: 'Μεσαία',
  high: 'Υψηλή',
  urgent: 'Επείγουσα',
};

export function PortalGantt({
  projectId,
  projectName,
  color,
  tasks,
}: {
  projectId: string;
  projectName: string;
  color: string;
  tasks: PortalTask[];
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<GanttTask | null>(null);

  const rows = useMemo<GanttRow[]>(
    () => [
      {
        id: projectId,
        label: projectName,
        sublabel: `${tasks.length} ${tasks.length === 1 ? 'εργασία' : 'εργασίες'}`,
        color,
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          startDate: task.startDate ? new Date(task.startDate) : null,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          estimatedHours: task.estimatedHours,
          status: task.status,
          priority: task.priority,
          projectId,
          projectName,
          projectColor: color,
          assignees: task.assignees,
          dependencyIds: task.dependencyIds,
        })),
      },
    ],
    [projectId, projectName, color, tasks],
  );

  function toggleRow(rowId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-12 text-center">
        <p className="text-sm font-medium text-fluent-neutral-80">Δεν υπάρχουν εργασίες για το χρονοδιάγραμμα</p>
        <p className="mt-1 text-xs text-fluent-neutral-60">
          Το Gantt θα εμφανιστεί μόλις προστεθούν κοινόχρηστες εργασίες στο έργο.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-base font-semibold text-fluent-neutral-90">Χρονοδιάγραμμα Gantt</h2>
        <p className="mt-0.5 text-xs text-fluent-neutral-60">
          Προβολή μόνο · επιλέξτε μια εργασία για λεπτομέρειες και μέλη ομάδας.
        </p>
      </div>

      <Gantt
        rows={rows}
        canEdit={false}
        zoom="month"
        collapsed={collapsed}
        onToggleRow={toggleRow}
        onClickTask={setSelected}
      />

      {selected && (
        <Modal title={selected.title} description={selected.projectName} onClose={() => setSelected(null)}>
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">Κατάσταση</dt>
                <dd className="mt-1 text-fluent-neutral-90">{STATUS_LABEL[selected.status] ?? selected.status}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">Προτεραιότητα</dt>
                <dd className="mt-1 text-fluent-neutral-90">{PRIORITY_LABEL[selected.priority] ?? selected.priority}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">Έναρξη</dt>
                <dd className="mt-1 tabular-nums text-fluent-neutral-90">
                  {selected.startDate ? fmt.format(selected.startDate) : 'Δεν έχει οριστεί'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">Προθεσμία</dt>
                <dd className="mt-1 tabular-nums text-fluent-neutral-90">
                  {selected.dueDate ? fmt.format(selected.dueDate) : 'Δεν έχει οριστεί'}
                </dd>
              </div>
              {selected.estimatedHours !== null && (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">Εκτίμηση</dt>
                  <dd className="mt-1 tabular-nums text-fluent-neutral-90">{selected.estimatedHours} ώρες</dd>
                </div>
              )}
            </dl>

            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">Μέλη που εμπλέκονται</h3>
              {selected.assignees.length === 0 ? (
                <p className="mt-2 text-xs text-fluent-neutral-60">Δεν έχει γίνει ανάθεση σε μέλη.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selected.assignees.map((assignee) => (
                    <li key={assignee.id} className="flex items-center gap-2.5">
                      <Avatar user={assignee} size="sm" />
                      <span className="text-fluent-neutral-90">{assignee.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end border-t border-black/5 pt-4">
              <Button variant="secondary" onClick={() => setSelected(null)}>Κλείσιμο</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
