'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  Dismiss20Regular,
  Send20Regular,
  Mail20Regular,
  Open20Regular,
  CheckmarkCircle20Filled,
  DismissCircle20Filled,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { sendProjectReport, buildProjectReportPreview } from './report-actions';

export function ReportModal({
  projectId,
  projectName,
  defaultRecipientName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  defaultRecipientName?: string;
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState('');
  const [recipientName, setRecipientName] = useState(defaultRecipientName ?? '');
  const [coverMessage, setCoverMessage] = useState('');
  const [ccSelf, setCcSelf] = useState(true);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('recipients', recipients);
      if (recipientName.trim()) fd.set('recipientName', recipientName.trim());
      if (coverMessage.trim()) fd.set('coverMessage', coverMessage.trim());
      if (ccSelf) fd.set('ccSelf', 'on');
      const res = await sendProjectReport(projectId, fd);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? 'Αποτυχία αποστολής.' });
        return;
      }
      setStatus({ ok: true, message: 'Η αναφορά στάλθηκε επιτυχώς.' });
    });
  }

  async function handlePreview() {
    setStatus(null);
    const res = await buildProjectReportPreview(projectId);
    if (!res.ok || !res.html) {
      setStatus({ ok: false, message: res.error ?? 'Σφάλμα προεπισκόπησης.' });
      return;
    }
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=900');
    if (!w) {
      setStatus({ ok: false, message: 'Ο browser εμπόδισε το popup. Επίτρεψέ το και προσπάθησε ξανά.' });
      return;
    }
    w.document.open();
    w.document.write(res.html);
    w.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white rounded-xl shadow-fluent-16 w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-black/5 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-90 inline-flex items-center gap-2">
              <Mail20Regular className="h-5 w-5 text-fluent-blue-600" />
              Αποστολή αναφοράς πελάτη
            </h2>
            <p className="text-xs text-fluent-neutral-60 mt-0.5">
              Στείλε μια συνοπτική προβολή του έργου <strong>{projectName}</strong> σε πελάτη ή ενδιαφερόμενο.
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-fluent-neutral-70 mb-1.5">
              Παραλήπτες <span className="text-fluent-accent-red">*</span>
            </label>
            <input
              type="text"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="customer@example.com, manager@example.com"
              required
              autoFocus
              className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
            <p className="text-[11px] text-fluent-neutral-60 mt-1">
              Διαχώρισε πολλαπλά email με κόμμα ή νέα γραμμή.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-fluent-neutral-70 mb-1.5">
              Όνομα παραλήπτη (προαιρ.)
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="π.χ. Γιάννης Παπαδόπουλος"
              className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
            <p className="text-[11px] text-fluent-neutral-60 mt-1">
              Χρησιμοποιείται στον χαιρετισμό «Γεια σου, …». Αν αφεθεί κενό, δεν εμφανίζεται.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-fluent-neutral-70 mb-1.5">
              Μήνυμα κάλυψης (προαιρ.)
            </label>
            <textarea
              value={coverMessage}
              onChange={(e) => setCoverMessage(e.target.value)}
              rows={4}
              placeholder="π.χ. Σας στέλνουμε μια ενημέρωση προόδου για το έργο. Παραμένουμε στη διάθεσή σας για διευκρινίσεις."
              className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none resize-none"
              maxLength={2000}
            />
            <p className="text-[11px] text-fluent-neutral-60 mt-1">
              Εμφανίζεται σε μπλε πλαίσιο πάνω από την αναφορά.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-md p-2 hover:bg-fluent-neutral-4 cursor-pointer">
            <input
              type="checkbox"
              checked={ccSelf}
              onChange={(e) => setCcSelf(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-fluent-blue-600"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-fluent-neutral-90">
                Αντίγραφο και σε εμένα (CC)
              </span>
              <span className="block text-[11px] text-fluent-neutral-60 mt-0.5">
                Θα λάβεις ένα αντίγραφο για τα αρχεία σου.
              </span>
            </span>
          </label>

          {status && (
            <motion.div
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              className={`px-3 py-2 rounded-md text-sm inline-flex items-center gap-2 ${
                status.ok
                  ? 'bg-fluent-accent-green/10 border border-fluent-accent-green/30 text-fluent-accent-green'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {status.ok ? (
                <CheckmarkCircle20Filled className="h-4 w-4" />
              ) : (
                <DismissCircle20Filled className="h-4 w-4" />
              )}
              {status.message}
            </motion.div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Open20Regular className="h-4 w-4" />}
              onClick={handlePreview}
              disabled={pending}
            >
              Προεπισκόπηση
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onClose}
                disabled={pending}
              >
                {status?.ok ? 'Κλείσιμο' : 'Ακύρωση'}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                icon={<Send20Regular className="h-4 w-4" />}
                disabled={pending || status?.ok === true}
              >
                {pending ? 'Αποστολή…' : 'Αποστολή αναφοράς'}
              </Button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
