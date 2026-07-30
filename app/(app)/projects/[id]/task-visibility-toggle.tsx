'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye20Regular, EyeOff20Regular } from '@fluentui/react-icons';
import { setTaskVisibility } from './comment-actions';

/**
 * Ορατότητα εργασίας προς τον πελάτη.
 *
 * Εμφανίζεται ΜΟΝΟ σε έργα που έχουν πελάτη: σε εσωτερικό έργο ή σε έργο χωρίς
 * ανατεθειμένη εταιρία δεν υπάρχει κανείς να δει την εργασία, οπότε ο διακόπτης
 * θα ήταν θόρυβος που υπονοεί ότι κάτι εκτίθεται.
 *
 * Το default είναι «ορατή», οπότε το βάρος πέφτει στην ένδειξη: όταν κάποιος
 * κρύψει την εργασία, η κατάσταση γίνεται έντονα ορατή στην ομάδα, ώστε να μη
 * μείνει κάτι κρυμμένο κατά λάθος.
 */
export function TaskVisibilityToggle({
  taskId,
  visibility,
  canEdit,
}: {
  taskId: string;
  visibility: 'internal' | 'shared';
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const internal = visibility === 'internal';

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await setTaskVisibility(taskId, internal ? 'shared' : 'internal');
      if (!res.ok) {
        setError(res.error ?? 'Κάτι πήγε στραβά.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className={`mt-4 rounded-lg border px-3 py-2.5 ${
        internal
          ? 'border-fluent-neutral-30 bg-fluent-neutral-6'
          : 'border-fluent-blue-200 bg-fluent-blue-50/40'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {internal ? (
          <EyeOff20Regular className="h-5 w-5 shrink-0 text-fluent-neutral-60" />
        ) : (
          <Eye20Regular className="h-5 w-5 shrink-0 text-fluent-blue-600" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-fluent-neutral-90">
            {internal ? 'Εσωτερική εργασία' : 'Ορατή στον πελάτη'}
          </p>
          <p className="text-[11px] text-fluent-neutral-60">
            {internal
              ? 'Δεν εμφανίζεται στο portal ούτε μετράει στα ποσοστά του.'
              : 'Εμφανίζεται στο portal πελατών με την πορεία της.'}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-fluent-blue-600 transition-colors duration-150 hover:bg-white disabled:opacity-40"
          >
            {pending ? '…' : internal ? 'Κάν’ την ορατή' : 'Κάν’ την εσωτερική'}
          </button>
        )}
      </div>

      {error && <p className="mt-1.5 text-[11px] text-fluent-accent-red">{error}</p>}
    </div>
  );
}
