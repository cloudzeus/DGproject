'use client';

/**
 * Το tab «Πρόταση».
 *
 * Τέσσερις καταστάσεις, μία διεπαφή:
 *   - καμία ανάλυση → πρόσκληση για ανέβασμα
 *   - τρέχει       → μετρητής τμημάτων με polling
 *   - απέτυχε      → τι έφταιξε, και κουμπί να ξαναδοκιμάσει
 *   - έτοιμη       → τρεις λίστες προς επεξεργασία και μετατροπή
 *
 * Το polling σταματά μόλις η κατάσταση φύγει από pending/analyzing. Χωρίς αυτό
 * το tab χτυπά τον διακομιστή για πάντα σε ένα ανοιχτό tab του browser.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DocumentSearch24Regular,
  ArrowClockwise20Regular,
  Add16Regular,
  Sparkle20Filled,
  Warning20Filled,
  ArrowUpload20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { MAX_OCR_PAGES, isPdfFile } from '@/lib/ocr/rasterize';
import { ProposalItemRow, type ProposalItemView, type ProposalMember } from './proposal-item-row';
import {
  getProposalStatus,
  retryProposalAnalysis,
  addProposalItem,
  convertSelectedProposalItems,
} from './proposal-actions';

export type ProposalAnalysisView = {
  id: string;
  fileName: string;
  status: 'pending' | 'analyzing' | 'ready' | 'failed';
  aiError: string | null;
  summary: string | null;
  charCount: number;
  chunkCount: number;
  ocrPageCount: number;
  ocrTruncated: boolean;
  ocrWarning: string | null;
  createdAt: string;
  items: ProposalItemView[];
};

const SECTIONS: { kind: ProposalItemView['kind']; label: string; hint: string }[] = [
  { kind: 'step', label: 'Βήματα', hint: 'Γίνονται εργασίες στο board' },
  { kind: 'milestone', label: 'Ορόσημα', hint: 'Εργασίες με ημερομηνία παράδοσης — ο πελάτης τις βλέπει στο χρονοδιάγραμμα' },
  { kind: 'requirement', label: 'Απαιτήσεις', hint: 'Το συμφωνημένο εύρος — δεν γίνονται εργασίες' },
];

const POLL_MS = 3000;

export function ProposalTab({
  projectId,
  analysis,
  members,
}: {
  projectId: string;
  analysis: ProposalAnalysisView | null;
  members: ProposalMember[];
}) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const running = analysis?.status === 'pending' || analysis?.status === 'analyzing';

  // Polling μόνο όσο τρέχει. Το router.refresh() ξαναφέρνει τη σελίδα από τον
  // διακομιστή με τα αντικείμενα μέσα — το action επιστρέφει μόνο κατάσταση.
  useEffect(() => {
    if (!analysis || !running) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      const res = await getProposalStatus(analysis.id);
      if (cancelled || !res.ok) return;
      if (res.data.status !== 'pending' && res.data.status !== 'analyzing') {
        router.refresh();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [analysis, running, router]);

  const grouped = useMemo(() => {
    const map = new Map<ProposalItemView['kind'], ProposalItemView[]>();
    for (const s of SECTIONS) map.set(s.kind, []);
    for (const item of analysis?.items ?? []) map.get(item.kind)?.push(item);
    return map;
  }, [analysis]);

  const selectableIds = useMemo(
    () => (analysis?.items ?? []).filter((i) => i.status === 'draft').map((i) => i.id),
    [analysis],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: string[], nextSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (nextSelected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const onChanged = useCallback(() => router.refresh(), [router]);

  function convert() {
    if (!analysis) return;
    startTransition(async () => {
      const res = await convertSelectedProposalItems(analysis.id, Array.from(selected));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { tasksCreated, requirementsCreated, skipped, notified } = res.data;
      setError(null);
      setSelected(new Set());
      setNotice(
        [
          tasksCreated > 0 ? `${tasksCreated} εργασίες` : null,
          requirementsCreated > 0 ? `${requirementsCreated} απαιτήσεις` : null,
        ]
          .filter(Boolean)
          .join(' και ') +
          ' δημιουργήθηκαν.' +
          (notified > 0
            ? ` Ειδοποιήθηκ${notified === 1 ? 'ε 1 άτομο' : `αν ${notified} άτομα`}.`
            : '') +
          (skipped > 0 ? ` ${skipped} είχαν ήδη μετατραπεί.` : ''),
      );
      router.refresh();
    });
  }

  function retry() {
    if (!analysis) return;
    startTransition(async () => {
      const res = await retryProposalAnalysis(analysis.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  if (!analysis) {
    return (
      <>
        <EmptyState onUpload={() => setUploadOpen(true)} />
        {uploadOpen && (
          <UploadModal
            projectId={projectId}
            onClose={() => setUploadOpen(false)}
            onDone={() => {
              setUploadOpen(false);
              router.refresh();
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-fluent-neutral-10 bg-white px-4 py-3 shadow-fluent-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkle20Filled className="text-fluent-blue-500" />
            <h3 className="truncate font-display text-base font-semibold text-fluent-neutral-90">
              {analysis.fileName}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-fluent-neutral-60">
            {analysis.charCount.toLocaleString('el-GR')} χαρακτήρες
            {analysis.chunkCount > 1 && ` σε ${analysis.chunkCount} τμήματα`}
          </p>
          {analysis.ocrPageCount > 0 && (
            <p
              className="mt-1 inline-flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-fluent-accent-orange"
              title="Το κείμενο είναι μεταγραφή από εικόνες — τα αποσπάσματα μπορεί να έχουν λάθη ανάγνωσης"
            >
              <Warning20Filled className="h-3.5 w-3.5" />
              Διαβάστηκε με οπτική αναγνώριση ({analysis.ocrPageCount} σελίδες)
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowClockwise20Regular />}
            onClick={retry}
            disabled={pending || running}
          >
            Νέα ανάλυση
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowUpload20Regular />}
            onClick={() => setUploadOpen(true)}
          >
            Άλλο αρχείο
          </Button>
        </div>
      </header>

      {running && <RunningState chunkCount={analysis.chunkCount} />}

      {analysis.status === 'failed' && (
        <div className="flex items-start gap-3 rounded-lg border border-fluent-accent-red/20 bg-red-50 px-4 py-3">
          <Warning20Filled className="mt-0.5 shrink-0 text-fluent-accent-red" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fluent-neutral-90">Η ανάλυση απέτυχε</p>
            <p className="mt-0.5 break-words text-xs text-fluent-neutral-70">
              {analysis.aiError ?? 'Άγνωστο σφάλμα.'}
            </p>
          </div>
        </div>
      )}

      {analysis.ocrWarning && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs text-fluent-neutral-70">
          {analysis.ocrWarning}
        </div>
      )}

      {analysis.status === 'ready' && analysis.aiError && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs text-fluent-neutral-70">
          {analysis.aiError}
        </div>
      )}

      {analysis.summary && (
        <p className="rounded-lg border border-fluent-neutral-10 bg-fluent-neutral-4 px-4 py-3 text-sm leading-relaxed text-fluent-neutral-70">
          {analysis.summary}
        </p>
      )}

      {notice && (
        <div className="rounded-lg border border-fluent-accent-green/25 bg-green-50 px-4 py-2.5 text-sm text-fluent-neutral-80">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-fluent-accent-red/20 bg-red-50 px-4 py-2.5 text-sm text-fluent-neutral-80">
          {error}
        </div>
      )}

      {analysis.status === 'ready' &&
        SECTIONS.map((section) => (
          <Section
            key={section.kind}
            analysisId={analysis.id}
            label={section.label}
            hint={section.hint}
            kind={section.kind}
            items={grouped.get(section.kind) ?? []}
            members={members}
            selected={selected}
            onToggle={toggle}
            onSetMany={setMany}
            onChanged={onChanged}
          />
        ))}

      {analysis.status === 'ready' && analysis.items.length === 0 && (
        <p className="rounded-lg border border-dashed border-fluent-neutral-20 px-4 py-8 text-center text-sm text-fluent-neutral-60">
          Δεν βρέθηκαν βήματα ή απαιτήσεις στο αρχείο. Πρόσθεσέ τα χειροκίνητα, ή
          ανέβασε άλλο αρχείο.
        </p>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-lg border border-fluent-blue-200 bg-white px-4 py-3 shadow-fluent-16">
          <span className="text-sm text-fluent-neutral-70">
            {selected.size} από {selectableIds.length} επιλεγμένα
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Καθαρισμός
            </Button>
            <Button variant="primary" size="sm" onClick={convert} disabled={pending}>
              {pending ? 'Δημιουργία…' : 'Δημιουργία εργασιών'}
            </Button>
          </div>
        </div>
      )}

      {uploadOpen && (
        <UploadModal
          projectId={projectId}
          onClose={() => setUploadOpen(false)}
          onDone={() => {
            setUploadOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Section({
  analysisId,
  label,
  hint,
  kind,
  items,
  members,
  selected,
  onToggle,
  onSetMany,
  onChanged,
}: {
  analysisId: string;
  label: string;
  hint: string;
  kind: ProposalItemView['kind'];
  items: ProposalItemView[];
  members: ProposalMember[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], nextSelected: boolean) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, startTransition] = useTransition();

  const drafts = items.filter((i) => i.status === 'draft');
  const allSelected = drafts.length > 0 && drafts.every((i) => selected.has(i.id));

  function add() {
    const t = title.trim();
    if (t.length < 3) return;
    startTransition(async () => {
      const res = await addProposalItem(analysisId, { kind, title: t });
      if (res.ok) {
        setTitle('');
        setAdding(false);
        onChanged();
      }
    });
  }

  return (
    <section className="rounded-lg border border-fluent-neutral-10 bg-white shadow-fluent-2">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-fluent-neutral-8 px-4 py-2.5">
        <div className="min-w-0">
          <h4 className="font-display text-sm font-semibold text-fluent-neutral-90">
            {label}{' '}
            <span className="font-normal text-fluent-neutral-50">({items.length})</span>
          </h4>
          <p className="text-[11px] text-fluent-neutral-50">{hint}</p>
        </div>
        <div className="flex items-center gap-2">
          {drafts.length > 0 && (
            <button
              type="button"
              onClick={() => onSetMany(drafts.map((i) => i.id), !allSelected)}
              className="text-xs text-fluent-blue-600 hover:underline"
            >
              {allSelected ? 'Αποεπιλογή όλων' : 'Επιλογή όλων'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-fluent-neutral-60 hover:bg-fluent-neutral-8"
          >
            <Add16Regular />
            προσθήκη
          </button>
        </div>
      </header>

      <div className="space-y-2 p-3">
        {adding && (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
                if (e.key === 'Escape') setAdding(false);
              }}
              placeholder="Τίτλος…"
              className="h-8 flex-1 rounded-md border border-fluent-neutral-20 px-2 text-sm outline-none focus:border-fluent-blue-500"
            />
            <Button size="sm" variant="primary" onClick={add} disabled={pending}>
              Προσθήκη
            </Button>
          </div>
        )}

        {items.length === 0 && !adding && (
          <p className="px-1 py-3 text-center text-xs text-fluent-neutral-50">
            Τίποτα εδώ.
          </p>
        )}

        {items.map((item) => (
          <ProposalItemRow
            key={item.id}
            item={item}
            members={members}
            selected={selected.has(item.id)}
            onToggle={() => onToggle(item.id)}
            onChanged={onChanged}
          />
        ))}
      </div>
    </section>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-fluent-neutral-20 bg-fluent-neutral-4 px-6 py-16 text-center">
      <DocumentSearch24Regular className="text-fluent-neutral-40" />
      <h3 className="mt-3 font-display text-base font-semibold text-fluent-neutral-90">
        Ανέβασε την πρόταση του έργου
      </h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-fluent-neutral-60">
        Η πρόταση περιέχει ήδη το πλάνο. Το DeepSeek τη διαβάζει και προτείνει βήματα,
        ορόσημα και απαιτήσεις — τα διορθώνεις και γίνονται εργασίες.
      </p>
      <Button variant="primary" className="mt-5" icon={<ArrowUpload20Regular />} onClick={onUpload}>
        Ανέβασμα PDF ή DOCX
      </Button>
    </div>
  );
}

function RunningState({ chunkCount }: { chunkCount: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-fluent-blue-200 bg-fluent-blue-50 px-4 py-3">
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-fluent-blue-300 border-t-fluent-blue-600" />
      <div>
        <p className="text-sm font-semibold text-fluent-neutral-90">Η ανάλυση τρέχει…</p>
        <p className="text-xs text-fluent-neutral-60">
          {chunkCount > 1
            ? `Η πρόταση κόπηκε σε ${chunkCount} τμήματα και αναλύεται ένα-ένα.`
            : 'Διαβάζεται η πρόταση. Μπορεί να πάρει ένα-δύο λεπτά.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Το ανέβασμα, με έλεγχο για σαρωμένο PDF πριν φύγει τίποτα.
 *
 * Μόλις διαλεγεί αρχείο, ένας γρήγορος έλεγχος (`probePdf`) λέει πόσες σελίδες
 * έχει και αν έχει επιλέξιμο κείμενο. Έτσι ο χρήστης ξέρει ΠΡΙΝ πατήσει
 * ανέβασμα ότι το αρχείο θα περάσει από οπτική αναγνώριση — και τι σημαίνει
 * αυτό για τα δεδομένα του.
 *
 * Η μετατροπή σε εικόνες γίνεται εδώ, στον browser, και μόνο όταν χρειάζεται.
 */
function UploadModal({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<{ pageCount: number; hasText: boolean } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'probing' | 'rendering' | 'uploading'>('idle');
  const [rendered, setRendered] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase !== 'idle';
  const needsOcr = probe !== null && !probe.hasText;
  const ocrPageCount = probe ? Math.min(probe.pageCount, MAX_OCR_PAGES) : 0;

  async function pick(next: File | null) {
    setFile(next);
    setProbe(null);
    setError(null);
    if (!next || !isPdfFile(next)) return;

    setPhase('probing');
    try {
      const { probePdf } = await import('@/lib/ocr/rasterize');
      setProbe(await probePdf(next));
    } catch (e) {
      // Ο έλεγχος είναι βοήθημα, όχι προϋπόθεση: αν αποτύχει, ο server θα πει
      // ό,τι έχει να πει. Δεν μπλοκάρουμε το ανέβασμα γι' αυτόν.
      console.error('[proposals] ο έλεγχος του PDF απέτυχε:', e);
    } finally {
      setPhase('idle');
    }
  }

  async function submit() {
    if (!file) return;
    setError(null);

    const body = new FormData();
    body.append('file', file);

    if (needsOcr) {
      setPhase('rendering');
      try {
        const { rasterizePdf } = await import('@/lib/ocr/rasterize');
        const result = await rasterizePdf(file, {
          onProgress: (done, total) => setRendered({ done, total }),
        });
        body.append('ocrPages', JSON.stringify(result.pages));
        body.append('ocrTruncated', String(result.truncated));
      } catch (e) {
        setError(`Η μετατροπή των σελίδων απέτυχε: ${e instanceof Error ? e.message : 'unknown'}`);
        setPhase('idle');
        return;
      }
    }

    setPhase('uploading');
    try {
      const res = await fetch(`/api/proposals/${projectId}/upload`, { method: 'POST', body });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Το ανέβασμα απέτυχε.');
        return;
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Το ανέβασμα απέτυχε.');
    } finally {
      setPhase('idle');
    }
  }

  const buttonLabel =
    phase === 'rendering'
      ? `Μετατροπή σελίδων ${rendered.done}/${rendered.total}…`
      : phase === 'uploading'
        ? needsOcr
          ? 'Οπτική αναγνώριση…'
          : 'Ανεβαίνει…'
        : 'Ανέβασμα και ανάλυση';

  return (
    <Modal
      title="Ανέβασμα πρότασης"
      description="PDF ή DOCX, έως 20 MB. Τα σαρωμένα PDF διαβάζονται με οπτική αναγνώριση."
      onClose={onClose}
    >
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          disabled={busy}
          className="w-full rounded-md border border-fluent-neutral-20 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-fluent-neutral-8 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />

        {phase === 'probing' && (
          <p className="text-xs text-fluent-neutral-60">Έλεγχος αρχείου…</p>
        )}

        {probe && probe.hasText && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-xs text-fluent-neutral-70">
            {probe.pageCount} σελίδες με επιλέξιμο κείμενο. Δεν χρειάζεται οπτική αναγνώριση.
          </p>
        )}

        {needsOcr && (
          <div className="space-y-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-fluent-neutral-90">
              <Warning20Filled className="text-fluent-accent-orange" />
              Σαρωμένο αρχείο — {probe!.pageCount} σελίδες
            </p>
            <p className="text-xs leading-relaxed text-fluent-neutral-70">
              Δεν έχει επιλέξιμο κείμενο, οπότε
              {probe!.pageCount > MAX_OCR_PAGES
                ? ` οι πρώτες ${MAX_OCR_PAGES} σελίδες θα διαβαστούν`
                : ` οι ${ocrPageCount} σελίδες θα διαβαστούν`}{' '}
              ως εικόνες από το Gemini.
            </p>
            <p className="text-xs leading-relaxed text-fluent-neutral-70">
              <strong>Πρόσεξε:</strong> μια εικόνα δεν μασκάρεται. Ό,τι είναι τυπωμένο πάνω
              της — ΑΦΜ, IBAN, ονόματα, τιμές — το βλέπει η Google. Η μάσκα μπαίνει μετά,
              στο κείμενο που γυρίζει, πριν πάει για ανάλυση.
            </p>
          </div>
        )}

        {!needsOcr && (
          <p className="text-xs leading-relaxed text-fluent-neutral-60">
            Email, τηλέφωνα, ΑΦΜ, IBAN και ονόματα εταιρειών κρύβονται πριν το κείμενο
            φύγει προς το μοντέλο.
          </p>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-fluent-accent-red">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Άκυρο
          </Button>
          <Button variant="primary" onClick={submit} disabled={!file || busy}>
            {buttonLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
