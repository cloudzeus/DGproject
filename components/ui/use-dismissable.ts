'use client';

import { useEffect } from 'react';

/**
 * Οι δύο συμπεριφορές που κάθε overlay οφείλει να έχει και καμία χειροποίητη
 * υλοποίηση στην εφαρμογή δεν είχε: **Escape κλείνει** και **το body δεν
 * κυλάει από πίσω**.
 *
 * Χωρίς Escape, ο χρήστης που άνοιξε κατά λάθος έναν διάλογο πρέπει να βρει το
 * X· χωρίς κλείδωμα του scroll, το ποντίκι πάνω από το scrim κυλάει τη σελίδα
 * που δεν βλέπει και χάνει τη θέση του.
 *
 * Το `Modal` το χρησιμοποιεί εσωτερικά. Τα overlays που έχουν δικό τους chrome
 * (π.χ. εισαγωγή email με δική του περιοχή κύλισης) το καλούν απευθείας, ώστε
 * να αποκτήσουν τη συμπεριφορά χωρίς να αλλάξει η διάταξή τους.
 */
export function useDismissable(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, enabled]);
}
