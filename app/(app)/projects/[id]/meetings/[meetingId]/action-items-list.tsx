'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type ActionItem = {
  title: string;
  description: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  confidence: number;
  sourceQuote: string;
  sourceTimestampSec: number;
};

type ProjectOption = {
  id: string;
  name: string;
  status: string;
};

/**
 * Action items list with a per-item "Create in another project" picker.
 *
 * The primary project's auto-tasks were already created during meeting
 * processing. This component lets admins create ADDITIONAL tasks in other
 * projects for items where the meeting touched multiple projects.
 *
 * State is per-item — selecting a project and clicking "Create" fires a POST
 * to /api/meetings/:id/create-task. On success we show a "Created" pill with
 * a link to the project, and reset the picker so they can add to yet another
 * project if needed.
 */
export function ActionItemsList({
  meetingId,
  primaryProjectId,
  actionItems,
  projects,
}: {
  meetingId: string;
  primaryProjectId: string;
  actionItems: ActionItem[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [picker, setPicker] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [createdAt, setCreatedAt] = useState<Record<number, { taskId: string; projectId: string; projectName: string }[]>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  async function createInProject(actionItemIndex: number) {
    const projectId = picker[actionItemIndex];
    if (!projectId) return;
    setPending((s) => ({ ...s, [actionItemIndex]: true }));
    setErrors((s) => ({ ...s, [actionItemIndex]: '' }));
    try {
      const res = await fetch(`/api/meetings/${meetingId}/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionItemIndex, projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((s) => ({ ...s, [actionItemIndex]: data.error ?? 'Σφάλμα' }));
        return;
      }
      const project = projects.find((p) => p.id === projectId);
      setCreatedAt((s) => ({
        ...s,
        [actionItemIndex]: [
          ...(s[actionItemIndex] ?? []),
          { taskId: data.task.id, projectId, projectName: project?.name ?? projectId },
        ],
      }));
      // Reset picker for this row so admin can pick yet another project
      setPicker((s) => ({ ...s, [actionItemIndex]: '' }));
      router.refresh();
    } catch (e) {
      setErrors((s) => ({
        ...s,
        [actionItemIndex]: e instanceof Error ? e.message : 'Network error',
      }));
    } finally {
      setPending((s) => ({ ...s, [actionItemIndex]: false }));
    }
  }

  return (
    <ul className="space-y-3">
      {actionItems.map((a, i) => {
        const additionalProjects = projects.filter((p) => p.id !== primaryProjectId);
        const createdHere = createdAt[i] ?? [];
        return (
          <li key={i} className="rounded border border-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{a.title}</div>
                <p className="mt-1 text-sm text-gray-700">{a.description}</p>
                <blockquote className="mt-2 border-l-2 border-gray-300 pl-3 text-xs italic text-gray-500">
                  &quot;{a.sourceQuote}&quot; — {formatSec(a.sourceTimestampSec)}
                </blockquote>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <ConfidenceBadge c={a.confidence} />
                <PriorityBadge p={a.priority} />
                {a.dueDate && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                    due {a.dueDate}
                  </span>
                )}
                {a.assigneeEmail && (
                  <span className="max-w-[160px] truncate text-gray-500">
                    → {a.assigneeEmail}
                  </span>
                )}
              </div>
            </div>

            {additionalProjects.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                <span className="text-xs text-gray-500">Δημιούργησε επιπλέον σε:</span>
                <select
                  value={picker[i] ?? ''}
                  onChange={(e) => setPicker((s) => ({ ...s, [i]: e.target.value }))}
                  disabled={pending[i]}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="">— επίλεξε project —</option>
                  {additionalProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.status !== 'active' ? ` (${p.status})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => createInProject(i)}
                  disabled={pending[i] || !picker[i]}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:bg-gray-300"
                >
                  {pending[i] ? 'Δημιουργία…' : 'Δημιουργία task'}
                </button>

                {createdHere.map((c) => (
                  <a
                    key={c.taskId}
                    href={`/projects/${c.projectId}`}
                    className="rounded bg-green-50 px-2 py-0.5 text-green-700 hover:bg-green-100"
                  >
                    ✓ {c.projectName}
                  </a>
                ))}

                {errors[i] && <span className="text-red-600">{errors[i]}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ConfidenceBadge({ c }: { c: number }) {
  const pct = Math.round(c * 100);
  let cls = 'bg-gray-100 text-gray-700';
  if (c >= 0.85) cls = 'bg-green-100 text-green-700';
  else if (c >= 0.6) cls = 'bg-amber-100 text-amber-700';
  else cls = 'bg-red-100 text-red-700';
  return <span className={`rounded px-2 py-0.5 ${cls}`}>conf {pct}%</span>;
}

function PriorityBadge({ p }: { p: string }) {
  const styles: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-gray-100 text-gray-700',
  };
  return <span className={`rounded px-2 py-0.5 ${styles[p] ?? styles.medium}`}>{p}</span>;
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
