'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dismiss20Regular, Sparkle20Regular } from '@fluentui/react-icons';
import {
  polishSolution,
  saveResolution,
  getResolutionPromptInfo,
} from '@/app/(app)/tickets/resolution-actions';

export type ResolutionPromptInfo = { ticketId: string; code: string; subject: string };

/**
 * Call right after a task is marked done. Resolves to the prompt info when a
 * linked ticket without a solution exists, else null. Never throws.
 */
export async function checkResolutionPrompt(taskId: string): Promise<ResolutionPromptInfo | null> {
  try {
    return await getResolutionPromptInfo(taskId);
  } catch {
    return null;
  }
}

export function ResolutionDialog({
  info,
  onClose,
}: {
  info: ResolutionPromptInfo;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [original, setOriginal] = useState<string | null>(null); // pre-polish text, for undo
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const polish = () =>
    startTransition(async () => {
      setError(null);
      const res = await polishSolution({ ticketId: info.ticketId, text });
      if (res.ok) {
        setOriginal(text);
        setText(res.text);
      } else setError(res.error);
    });

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await saveResolution({ ticketId: info.ticketId, text });
      if (res.ok) onClose();
      else setError(res.error);
    });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-xl rounded-xl bg-white shadow-fluent-16"
        >
          <div className="flex items-start justify-between border-b border-black/5 p-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">
                Περιγράψτε τη λύση
              </h2>
              <p className="mt-0.5 text-xs text-fluent-neutral-60">
                {info.code} · {info.subject}
              </p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 shrink-0 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
              aria-label="Κλείσιμο"
            >
              <Dismiss20Regular />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
              rows={7}
              placeholder="Τι προκαλούσε το πρόβλημα και πώς λύθηκε; Γράψτε ελεύθερα — μπορείτε μετά να το βελτιώσετε με AI."
              className="w-full rounded-lg border border-fluent-neutral-20 p-3 text-sm text-fluent-neutral-90 focus:border-fluent-blue-500 focus:outline-none"
            />
            {error && <p className="text-sm text-fluent-accent-red">{error}</p>}
            {original !== null && (
              <button
                type="button"
                onClick={() => {
                  setText(original);
                  setOriginal(null);
                }}
                className="text-xs text-fluent-blue-600 hover:underline"
              >
                Επαναφορά αρχικού κειμένου
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-black/5 p-4">
            <button
              type="button"
              onClick={polish}
              disabled={pending || text.trim().length < 10}
              className="inline-flex items-center gap-1.5 rounded-md border border-fluent-neutral-20 px-3 py-1.5 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6 disabled:opacity-50"
            >
              <Sparkle20Regular /> Βελτίωση με AI
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-md px-3 py-1.5 text-sm text-fluent-neutral-70 hover:bg-fluent-neutral-8"
              >
                Παράλειψη
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending || !text.trim()}
                className="rounded-md bg-fluent-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fluent-blue-700 disabled:opacity-50"
              >
                {pending ? 'Αποθήκευση…' : 'Αποθήκευση λύσης'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
