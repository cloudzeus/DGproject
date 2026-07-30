'use client';

import { motion } from 'framer-motion';
import { Dismiss20Regular } from '@fluentui/react-icons';
import { useDismissable } from './use-dismissable';

/**
 * Κοινό modal για φόρμες.
 *
 * Fluent 2: radius 12px για modals, two-layer shadow, scrim 40% ώστε το
 * περιεχόμενο από πίσω να μη διεκδικεί προσοχή. Το panel κάνει το ίδιο του
 * scroll (`max-h-[90vh] overflow-y-auto`) με sticky κεφαλίδα, ώστε μια μεγάλη
 * φόρμα να μη σπρώχνει το κουμπί αποθήκευσης εκτός οθόνης.
 *
 * Διαφυγή: Escape, κλικ στο scrim, και ρητό κουμπί κλεισίματος — τα τρία μαζί,
 * γιατί κάθε χρήστης φτάνει από διαφορετική συνήθεια.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  size = 'md',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useDismissable(onClose);

  const width =
    size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.33, 0, 0.67, 1] }}
        className={`relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-fluent-28`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-black/5 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-fluent-neutral-60">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fluent-neutral-70 transition-colors hover:bg-fluent-neutral-8"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>
      </motion.div>
    </div>
  );
}
