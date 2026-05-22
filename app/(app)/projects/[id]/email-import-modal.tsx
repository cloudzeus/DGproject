'use client';

import { useEffect, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Dismiss20Regular, ArrowSync20Regular, Sparkle20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import {
  type AnalysisItem,
  type ApplyDecision,
  type InboxCandidate,
  analyzePicked,
  applyIngest,
  searchProjectInbox,
} from './email-ingest-actions';

type Step = 'search' | 'analyze' | 'apply';

type OpenTaskOption = { id: string; title: string; status: string };

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectCode: string;
  openTasks: OpenTaskOption[];
};

export function EmailImportModal({ open, onClose, projectId, projectCode, openTasks }: Props) {
  const [step, setStep] = useState<Step>('search');
  const [candidates, setCandidates] = useState<InboxCandidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [decisions, setDecisions] = useState<Record<string, ApplyDecision>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // First-open: load candidates automatically so the user sees something.
  useEffect(() => {
    if (!open) return;
    setStep('search');
    setCandidates([]);
    setPicked(new Set());
    setItems([]);
    setDecisions({});
    setError(null);
    startTransition(async () => {
      const res = await searchProjectInbox(projectId);
      if (res.ok && res.candidates) setCandidates(res.candidates);
      else setError(res.error ?? 'Αποτυχία αναζήτησης.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      const ids = [...picked];
      if (ids.length === 0) {
        setError('Διάλεξε τουλάχιστον ένα email.');
        return;
      }
      const res = await analyzePicked(projectId, ids);
      if (!res.ok || !res.items) {
        setError(res.error ?? 'Αποτυχία ανάλυσης.');
        return;
      }
      setItems(res.items);
      const initial: Record<string, ApplyDecision> = {};
      for (const it of res.items) {
        initial[it.candidate.graphMessageId] = {
          graphMessageId: it.candidate.graphMessageId,
          action: it.analysis.action,
          newTask: it.analysis.newTask,
          targetTaskId: it.analysis.targetTaskId,
          appendNote: it.analysis.appendNote,
          analysisRaw: it.analysis,
        };
      }
      setDecisions(initial);
      setStep('analyze');
    });
  }

  function updateDecision(id: string, patch: Partial<ApplyDecision>) {
    setDecisions((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function handleApply() {
    setError(null);
    startTransition(async () => {
      const list = items.map((it) => decisions[it.candidate.graphMessageId]).filter(Boolean);
      const res = await applyIngest(projectId, list);
      if (!res.ok) {
        setError(res.error ?? 'Αποτυχία εφαρμογής.');
        return;
      }
      setStep('apply');
      // Auto-close after a short success display.
      setTimeout(onClose, 1500);
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-xl shadow-fluent-16 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-black/5">
          <div className="font-display font-semibold text-fluent-neutral-95">
            Εισαγωγή emails — {projectCode}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-black/5 flex items-center justify-center text-fluent-neutral-70"
          >
            <Dismiss20Regular />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 text-sm text-fluent-accent-red bg-fluent-accent-red/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          {step === 'search' && (
            <>
              <div className="text-sm text-fluent-neutral-70 mb-3">
                Επίλεξε ποια emails (με tag <code className="bg-black/5 px-1 rounded">[FPM:p={projectCode}]</code>) θες να αποδελτιωθούν.
              </div>
              {pending && candidates.length === 0 && (
                <div className="text-sm text-fluent-neutral-60 flex items-center gap-2">
                  <ArrowSync20Regular className="animate-spin h-4 w-4" /> Αναζήτηση…
                </div>
              )}
              {!pending && candidates.length === 0 && (
                <div className="text-sm text-fluent-neutral-60">Δεν βρέθηκαν emails για αυτό το tag.</div>
              )}
              <div className="space-y-2">
                {candidates.map((c) => {
                  const active = picked.has(c.graphMessageId);
                  return (
                    <button
                      key={c.graphMessageId}
                      type="button"
                      onClick={() => !c.alreadyIngested && togglePick(c.graphMessageId)}
                      disabled={c.alreadyIngested}
                      className={`w-full text-left p-3 rounded-md border transition-colors ${
                        c.alreadyIngested
                          ? 'opacity-50 bg-fluent-neutral-4 border-black/5 cursor-not-allowed'
                          : active
                          ? 'bg-fluent-blue-50 border-fluent-blue-300'
                          : 'bg-white border-black/10 hover:bg-black/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm text-fluent-neutral-95 truncate">{c.subject}</div>
                          <div className="text-xs text-fluent-neutral-60 mt-0.5">
                            {c.from} → {c.to.join(', ')} · {new Date(c.receivedAt).toLocaleString('el-GR')}
                          </div>
                          <div className="text-xs text-fluent-neutral-70 mt-1 line-clamp-2">{c.preview}</div>
                        </div>
                        {c.alreadyIngested && (
                          <span className="text-[10px] uppercase tracking-wider text-fluent-neutral-60 shrink-0">
                            Έχει εισαχθεί
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 'analyze' && (
            <>
              <div className="text-sm text-fluent-neutral-70 mb-3">
                Δες τις προτεινόμενες ενέργειες από το AI. Άλλαξε ό,τι χρειάζεται πριν εφαρμοστούν.
              </div>
              <div className="space-y-3">
                {items.map((it) => {
                  const d = decisions[it.candidate.graphMessageId];
                  if (!d) return null;
                  return (
                    <div key={it.candidate.graphMessageId} className="border border-black/10 rounded-md p-3 space-y-2">
                      <div className="text-sm font-medium text-fluent-neutral-95">{it.candidate.subject}</div>
                      <div className="text-xs text-fluent-neutral-60">
                        {it.candidate.from} · {new Date(it.candidate.receivedAt).toLocaleString('el-GR')}
                      </div>
                      <div className="text-xs text-fluent-neutral-70 italic">{it.analysis.summary}</div>

                      <div className="flex flex-wrap gap-1.5">
                        {(['create_task', 'update_task', 'attach_only', 'ignore'] as const).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => updateDecision(it.candidate.graphMessageId, { action: a })}
                            className={`px-2 h-7 rounded-md text-xs ${
                              d.action === a
                                ? 'bg-fluent-blue-600 text-white'
                                : 'bg-fluent-neutral-8 text-fluent-neutral-80 hover:bg-fluent-neutral-10'
                            }`}
                          >
                            {a === 'create_task'
                              ? 'Νέο task'
                              : a === 'update_task'
                              ? 'Ενημέρωση task'
                              : a === 'attach_only'
                              ? 'Μόνο αρχειοθέτηση'
                              : 'Αγνόηση'}
                          </button>
                        ))}
                      </div>

                      {d.action === 'create_task' && (
                        <div className="space-y-1.5">
                          <input
                            value={d.newTask?.title ?? ''}
                            onChange={(e) =>
                              updateDecision(it.candidate.graphMessageId, {
                                newTask: { ...(d.newTask ?? { description: '', priority: 'medium', dueDate: null }), title: e.target.value },
                              })
                            }
                            placeholder="Τίτλος task"
                            className="w-full px-2 h-8 rounded-md border border-black/10 text-sm"
                          />
                          <textarea
                            value={d.newTask?.description ?? ''}
                            onChange={(e) =>
                              updateDecision(it.candidate.graphMessageId, {
                                newTask: { ...(d.newTask ?? { title: '', priority: 'medium', dueDate: null }), description: e.target.value },
                              })
                            }
                            placeholder="Περιγραφή"
                            rows={3}
                            className="w-full px-2 py-1.5 rounded-md border border-black/10 text-sm"
                          />
                          <div className="flex gap-2">
                            <select
                              value={d.newTask?.priority ?? 'medium'}
                              onChange={(e) =>
                                updateDecision(it.candidate.graphMessageId, {
                                  newTask: { ...(d.newTask ?? { title: '', description: '', dueDate: null }), priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent' },
                                })
                              }
                              className="px-2 h-8 rounded-md border border-black/10 text-sm"
                            >
                              <option value="low">Χαμηλή</option>
                              <option value="medium">Μεσαία</option>
                              <option value="high">Υψηλή</option>
                              <option value="urgent">Επείγουσα</option>
                            </select>
                            <input
                              type="date"
                              value={d.newTask?.dueDate ?? ''}
                              onChange={(e) =>
                                updateDecision(it.candidate.graphMessageId, {
                                  newTask: { ...(d.newTask ?? { title: '', description: '', priority: 'medium' }), dueDate: e.target.value || null },
                                })
                              }
                              className="px-2 h-8 rounded-md border border-black/10 text-sm"
                            />
                          </div>
                        </div>
                      )}

                      {d.action === 'update_task' && (
                        <div className="space-y-1.5">
                          <select
                            value={d.targetTaskId ?? ''}
                            onChange={(e) => updateDecision(it.candidate.graphMessageId, { targetTaskId: e.target.value })}
                            className="w-full px-2 h-8 rounded-md border border-black/10 text-sm"
                          >
                            <option value="">— Διάλεξε task —</option>
                            {openTasks.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.title} ({t.status})
                              </option>
                            ))}
                          </select>
                          <textarea
                            value={d.appendNote ?? ''}
                            onChange={(e) => updateDecision(it.candidate.graphMessageId, { appendNote: e.target.value })}
                            placeholder="Σημείωση που θα προστεθεί στο task"
                            rows={2}
                            className="w-full px-2 py-1.5 rounded-md border border-black/10 text-sm"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {step === 'apply' && (
            <div className="text-center py-8 text-fluent-neutral-80">
              <Sparkle20Regular className="h-8 w-8 mx-auto text-fluent-accent-green mb-2" />
              <div className="font-medium">Εφαρμόστηκε!</div>
              <div className="text-xs text-fluent-neutral-60 mt-1">Ανανέωση…</div>
            </div>
          )}
        </div>

        {step !== 'apply' && (
          <div className="flex items-center justify-between gap-2 px-5 h-14 border-t border-black/5 bg-fluent-neutral-4">
            {step === 'analyze' ? (
              <Button variant="secondary" onClick={() => setStep('search')} disabled={pending}>
                Πίσω
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={pending}>
                Άκυρο
              </Button>
              {step === 'search' && (
                <Button onClick={handleAnalyze} disabled={pending || picked.size === 0}>
                  <Sparkle20Regular className="h-4 w-4 mr-1.5" />
                  Ανάλυση ({picked.size})
                </Button>
              )}
              {step === 'analyze' && (
                <Button onClick={handleApply} disabled={pending}>
                  Εφαρμογή
                </Button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
