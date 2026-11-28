'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Add20Regular,
  ArrowSync20Regular,
  Copy20Regular,
  Delete20Regular,
  Edit20Regular,
  Eye20Regular,
  Key20Regular,
  LockClosed20Regular,
  People20Regular,
  Shield20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import type {
  VaultAuditEntry,
  VaultCategory,
  VaultEnvironment,
  VaultSecretInput,
  VaultSecretMetadata,
} from '@/lib/vault-types';
import {
  createVaultSecret,
  deleteVaultSecret,
  requestVaultOtp,
  revealPersonalVaultSecret,
  revealVaultSecret,
  updateVaultSecret,
  updateVaultSecretShares,
} from './vault-actions';

export type VaultEligibleUser = {
  id: string;
  name: string;
  email: string;
};

type Props = {
  projectId: string;
  secrets: VaultSecretMetadata[];
  auditEntries: VaultAuditEntry[];
  currentUserEmail: string;
  eligibleUsers: VaultEligibleUser[];
};

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  api_key: 'API key',
  connection_string: 'Connection string',
  credential: 'Στοιχεία σύνδεσης',
  other: 'Άλλο',
};

const ENVIRONMENT_LABELS: Record<VaultEnvironment, string> = {
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
  other: 'Άλλο',
};

const AUDIT_LABELS: Record<VaultAuditEntry['action'], string> = {
  created: 'Δημιουργία',
  updated: 'Ενημέρωση',
  deleted: 'Διαγραφή',
  otp_requested: 'Αποστολή OTP',
  revealed: 'Αποκάλυψη',
  reveal_failed: 'Αποτυχημένο OTP',
  access_granted: 'Κοινοποίηση',
  access_revoked: 'Ανάκληση κοινοποίησης',
};

const inputClass =
  'w-full min-h-10 rounded-md border border-fluent-neutral-20 bg-white px-3 py-2 text-sm text-fluent-neutral-90 outline-none transition-colors focus:border-fluent-blue-500 focus:ring-2 focus:ring-fluent-blue-100';

export function ProjectVaultTab({
  projectId,
  secrets,
  auditEntries,
  currentUserEmail,
  eligibleUsers,
}: Props) {
  const [editor, setEditor] = useState<{ secret?: VaultSecretMetadata } | null>(null);
  const [revealing, setRevealing] = useState<VaultSecretMetadata | null>(null);
  const [sharing, setSharing] = useState<VaultSecretMetadata | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleDelete(secret: VaultSecretMetadata) {
    if (!window.confirm(`Οριστική διαγραφή του «${secret.label}»;`)) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await deleteVaultSecret(projectId, secret.id);
        setMessage(result.ok ? 'Το μυστικό διαγράφηκε.' : result.error ?? 'Η διαγραφή απέτυχε.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Η διαγραφή απέτυχε.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-fluent-blue-50 text-fluent-blue-600">
            <LockClosed20Regular className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-fluent-neutral-90">Προσωπικό Vault έργου</h2>
              <Badge variant="blue">AES‑256‑GCM</Badge>
            </div>
            <p className="mt-0.5 text-xs text-fluent-neutral-60">
              Τα δικά σου κρυπτογραφημένα μυστικά και όσα έχουν κοινοποιηθεί σε εσένα.
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          icon={<Add20Regular className="h-4 w-4" />}
          onClick={() => setEditor({})}
        >
          Νέο μυστικό
        </Button>
      </header>

      <div className="flex items-start gap-3 rounded-lg border border-fluent-blue-100 bg-fluent-blue-50 px-4 py-3 text-sm text-fluent-neutral-80">
        <Shield20Regular className="mt-0.5 h-5 w-5 shrink-0 text-fluent-blue-600" />
        <p>
          Κάθε νέο μυστικό είναι ιδιωτικό. Εσύ επιλέγεις σε ποιους συμμετέχοντες θα κοινοποιηθεί.
          Τα δικά σου μυστικά ανοίγουν απευθείας· για τα κοινοποιημένα απαιτείται νέο OTP. Κάθε τιμή κρύβεται ξανά μετά από 60 δευτερόλεπτα.
        </p>
      </div>

      {message && (
        <div role="status" className="rounded-md border border-black/5 bg-white px-4 py-3 text-sm text-fluent-neutral-80">
          {message}
        </div>
      )}

      {secrets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white px-6 py-14 text-center">
          <Key20Regular className="mx-auto mb-3 h-10 w-10 text-fluent-neutral-40" />
          <h3 className="text-sm font-semibold text-fluent-neutral-90">Δεν υπάρχουν ορατά μυστικά</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-fluent-neutral-60">
            Δημιούργησε το πρώτο προσωπικό μυστικό. Θα είναι ορατό μόνο σε εσένα μέχρι να επιλέξεις κοινοποίηση.
          </p>
          <Button className="mt-4" variant="primary" onClick={() => setEditor({})} icon={<Add20Regular />}>
            Προσθήκη μυστικού
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-fluent-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-black/5 bg-fluent-neutral-4 text-left text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
                <tr>
                  <th className="px-4 py-3">Μυστικό</th>
                  <th className="px-4 py-3">Τύπος</th>
                  <th className="px-4 py-3">Περιβάλλον</th>
                  <th className="px-4 py-3">Τελευταία αλλαγή</th>
                  <th className="px-4 py-3 text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {secrets.map((secret) => (
                  <tr key={secret.id} className="transition-colors hover:bg-fluent-neutral-4">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 font-medium text-fluent-neutral-90">
                        <Key20Regular className="h-4 w-4 shrink-0 text-fluent-neutral-50" />
                        {secret.label}
                        <Badge variant={secret.ownedByMe ? 'blue' : 'neutral'}>
                          {secret.ownedByMe ? 'Δικό σου' : 'Κοινοποιημένο'}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-[11px] text-fluent-neutral-50">
                        {secret.ownedByMe
                          ? `Έκδοση ${secret.version} · ${secret.sharedUserIds.length} κοινοποιήσεις`
                          : `Από ${secret.createdByName} · έκδοση ${secret.version}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-fluent-neutral-70">{CATEGORY_LABELS[secret.category]}</td>
                    <td className="px-4 py-3">
                      <Badge variant={secret.environment === 'production' ? 'orange' : 'neutral'}>
                        {ENVIRONMENT_LABELS[secret.environment]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-fluent-neutral-60">
                      {secret.updatedAt.toLocaleString('el-GR', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                      {secret.updatedByName && <div>από {secret.updatedByName}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="primary" onClick={() => setRevealing(secret)} icon={<Eye20Regular />}>
                          Reveal
                        </Button>
                        {secret.ownedByMe && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setSharing(secret)} icon={<People20Regular />}>
                              Κοινοποίηση
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditor({ secret })} aria-label={`Επεξεργασία ${secret.label}`}>
                              <Edit20Regular />
                            </Button>
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleDelete(secret)} aria-label={`Διαγραφή ${secret.label}`}>
                              <Delete20Regular />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-black/5 bg-white p-4">
        <h3 className="text-sm font-semibold text-fluent-neutral-90">Πρόσφατο audit trail</h3>
        <p className="mt-0.5 text-xs text-fluent-neutral-60">
          Ενέργειες για τα ορατά σου μυστικά — ποτέ οι τιμές ή τα OTP.
        </p>
        {auditEntries.length > 0 && (
          <div className="mt-3 divide-y divide-black/5">
            {auditEntries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <div>
                  <span className="font-medium text-fluent-neutral-80">{AUDIT_LABELS[entry.action]}</span>
                  {entry.secretLabel && <span className="text-fluent-neutral-60"> · {entry.secretLabel}</span>}
                  <div className="mt-0.5 text-fluent-neutral-50">{entry.actorName}</div>
                </div>
                <time className="text-fluent-neutral-50">
                  {entry.createdAt.toLocaleString('el-GR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {editor && (
          <SecretEditorModal
            projectId={projectId}
            secret={editor.secret}
            onClose={() => setEditor(null)}
            onSaved={() => setEditor(null)}
          />
        )}
        {revealing && (
          <RevealModal
            projectId={projectId}
            secret={revealing}
            email={currentUserEmail}
            onClose={() => setRevealing(null)}
          />
        )}
        {sharing && (
          <ShareModal
            projectId={projectId}
            secret={sharing}
            users={eligibleUsers}
            initialUserIds={sharing.sharedUserIds}
            onClose={() => setSharing(null)}
            onSaved={() => setSharing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SecretEditorModal({
  projectId,
  secret,
  onClose,
  onSaved,
}: {
  projectId: string;
  secret?: VaultSecretMetadata;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(secret?.label ?? '');
  const [category, setCategory] = useState<VaultCategory>(secret?.category ?? 'api_key');
  const [environment, setEnvironment] = useState<VaultEnvironment>(secret?.environment ?? 'production');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const input: VaultSecretInput = { label, category, environment, value };
    startTransition(async () => {
      try {
        const result = secret
          ? await updateVaultSecret(projectId, secret.id, input)
          : await createVaultSecret(projectId, input);
        if (result.ok) onSaved();
        else setError(result.error ?? 'Η αποθήκευση απέτυχε.');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Η αποθήκευση απέτυχε.');
      }
    });
  }

  return (
    <Modal
      title={secret ? `Επεξεργασία: ${secret.label}` : 'Νέο προσωπικό μυστικό'}
      description="Η τιμή κρυπτογραφείται στον server. Το μυστικό ξεκινά ιδιωτικό και εμφανίζεται μόνο μετά από ενέργειά σου."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-fluent-neutral-80">
          Τίτλος
          <input autoFocus required maxLength={120} className={`${inputClass} mt-1.5`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="π.χ. OpenAI production key" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-fluent-neutral-80">
            Τύπος
            <select className={`${inputClass} mt-1.5`} value={category} onChange={(e) => setCategory(e.target.value as VaultCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-fluent-neutral-80">
            Περιβάλλον
            <select className={`${inputClass} mt-1.5`} value={environment} onChange={(e) => setEnvironment(e.target.value as VaultEnvironment)}>
              {Object.entries(ENVIRONMENT_LABELS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-fluent-neutral-80">
          {secret ? 'Νέα τιμή (προαιρετικό)' : 'Μυστική τιμή'}
          <textarea
            required={!secret}
            rows={5}
            maxLength={32768}
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} mt-1.5 resize-y font-mono text-xs`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={secret ? 'Άφησέ το κενό για να διατηρηθεί η τρέχουσα τιμή' : 'Επικόλλησε το κλειδί ή το connection string'}
          />
        </label>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-black/5 pt-4">
          <Button type="button" onClick={onClose}>Ακύρωση</Button>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Κρυπτογράφηση…' : 'Αποθήκευση'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function RevealModal({
  projectId,
  secret,
  email,
  onClose,
}: {
  projectId: string;
  secret: VaultSecretMetadata;
  email: string;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<'loading' | 'confirm' | 'code' | 'revealed'>(
    secret.ownedByMe ? 'loading' : 'confirm',
  );
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pending, startTransition] = useTransition();
  const personalRevealStarted = useRef(false);

  useEffect(() => {
    if (!secret.ownedByMe || personalRevealStarted.current) return;
    personalRevealStarted.current = true;
    revealPersonal();
  }, []);

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(onClose, 60_000);
    return () => window.clearTimeout(timer);
  }, [value, onClose]);

  function revealPersonal() {
    setError(null);
    setStage('loading');
    startTransition(async () => {
      try {
        const result = await revealPersonalVaultSecret(projectId, secret.id);
        if (result.ok && result.value !== undefined) {
          setValue(result.value);
          setStage('revealed');
        } else {
          setError(result.error ?? 'Η αποκάλυψη απέτυχε.');
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Η αποκάλυψη απέτυχε.');
      }
    });
  }

  function requestCode() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await requestVaultOtp(projectId, secret.id);
        if (!result.ok) {
          setError(result.error ?? 'Η αποστολή απέτυχε.');
          if (result.retryAfterSeconds) setResendAt(Date.now() + result.retryAfterSeconds * 1000);
          return;
        }
        setChallengeId(result.challengeId ?? null);
        setCode('');
        setStage('code');
        setResendAt(Date.now() + 60_000);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Η αποστολή απέτυχε.');
      }
    });
  }

  function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!challengeId) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await revealVaultSecret(projectId, secret.id, challengeId, code);
        if (result.ok && result.value !== undefined) {
          setValue(result.value);
          setCode('');
          setStage('revealed');
        } else {
          setError(result.error ?? 'Η επαλήθευση απέτυχε.');
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Η επαλήθευση απέτυχε.');
      }
    });
  }

  async function copyValue() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Η αντιγραφή δεν επιτρέπεται από τον browser. Επίλεξε και αντίγραψε την τιμή χειροκίνητα.');
    }
  }

  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    <Modal
      title={stage === 'revealed' ? secret.label : secret.ownedByMe ? 'Αποκάλυψη μυστικού' : 'Αποκάλυψη με OTP'}
      description={stage === 'revealed'
        ? 'Το παράθυρο θα κλείσει αυτόματα σε 60 δευτερόλεπτα.'
        : secret.ownedByMe
          ? 'Άμεση αποκρυπτογράφηση του προσωπικού σου μυστικού.'
          : `Θα χρησιμοποιηθεί το email ${email}.`}
      onClose={onClose}
      size="sm"
    >
      {stage === 'loading' && (
        <div className="space-y-4 text-center">
          <LockClosed20Regular className="mx-auto h-7 w-7 text-fluent-blue-600" />
          {!error && <p className="text-sm text-fluent-neutral-70">Αποκρυπτογράφηση…</p>}
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {error && <Button className="w-full" variant="primary" disabled={pending} onClick={revealPersonal}>Δοκίμασε ξανά</Button>}
        </div>
      )}

      {stage === 'confirm' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-fluent-neutral-4 p-4 text-sm text-fluent-neutral-80">
            <LockClosed20Regular className="mb-2 h-6 w-6 text-fluent-blue-600" />
            <p>Για το <strong>{secret.label}</strong> θα σταλεί κωδικός 6 ψηφίων. Ισχύει για 5 λεπτά και χρησιμοποιείται μία φορά.</p>
          </div>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button className="w-full" variant="primary" disabled={pending} onClick={requestCode}>
            {pending ? 'Αποστολή…' : 'Αποστολή OTP'}
          </Button>
        </div>
      )}

      {stage === 'code' && (
        <form onSubmit={verify} className="space-y-4">
          <label className="block text-center text-sm font-medium text-fluent-neutral-80">
            Κωδικός 6 ψηφίων
            <input
              autoFocus
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-2 h-14 w-full rounded-md border border-fluent-neutral-20 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-fluent-blue-500 focus:ring-2 focus:ring-fluent-blue-100"
            />
          </label>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" className="w-full" variant="primary" disabled={pending || code.length !== 6}>
            {pending ? 'Επαλήθευση…' : 'Επαλήθευση και αποκάλυψη'}
          </Button>
          <Button type="button" className="w-full" variant="ghost" disabled={pending || resendSeconds > 0} onClick={requestCode} icon={<ArrowSync20Regular />}>
            {resendSeconds > 0 ? `Νέο OTP σε ${resendSeconds}s` : 'Αποστολή νέου OTP'}
          </Button>
        </form>
      )}

      {stage === 'revealed' && value !== null && (
        <div className="space-y-3">
          <textarea readOnly rows={6} value={value} className="w-full resize-y rounded-md border border-fluent-neutral-20 bg-fluent-neutral-4 p-3 font-mono text-xs text-fluent-neutral-90 outline-none" />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button className="w-full" variant="primary" onClick={copyValue} icon={<Copy20Regular />}>
            {copied ? 'Αντιγράφηκε' : 'Αντιγραφή τιμής'}
          </Button>
          <Button className="w-full" variant="ghost" onClick={onClose} icon={<LockClosed20Regular />}>Κλείδωμα τώρα</Button>
        </div>
      )}
    </Modal>
  );
}

function ShareModal({
  projectId,
  secret,
  users,
  initialUserIds,
  onClose,
  onSaved,
}: {
  projectId: string;
  secret: VaultSecretMetadata;
  users: VaultEligibleUser[];
  initialUserIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialUserIds));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(userId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateVaultSecretShares(projectId, secret.id, [...selected]);
        if (result.ok) onSaved();
        else setError(result.error ?? 'Η αποθήκευση απέτυχε.');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Η αποθήκευση απέτυχε.');
      }
    });
  }

  return (
    <Modal
      title={`Κοινοποίηση: ${secret.label}`}
      description="Επίλεξε συμμετέχοντες του έργου που θα μπορούν να αποκαλύπτουν αυτό το μυστικό με OTP."
      onClose={onClose}
      size="sm"
    >
      <div className="space-y-4">
        <div className="rounded-md bg-fluent-neutral-4 px-3 py-2 text-xs text-fluent-neutral-70">
          Η κοινοποίηση αφορά μόνο αυτό το μυστικό. Μπορείς να την ανακαλέσεις ανά πάσα στιγμή.
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {users.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-fluent-neutral-60">
              Δεν υπάρχουν άλλοι συμμετέχοντες στο έργο.
            </p>
          ) : users.map((user) => (
            <label key={user.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-fluent-neutral-4">
              <input
                type="checkbox"
                checked={selected.has(user.id)}
                onChange={() => toggle(user.id)}
                className="h-4 w-4 accent-fluent-blue-500"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fluent-neutral-90">{user.name}</span>
                <span className="block truncate text-xs text-fluent-neutral-60">{user.email}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-black/5 pt-4">
          <Button onClick={onClose}>Ακύρωση</Button>
          <Button variant="primary" disabled={pending} onClick={save}>{pending ? 'Αποθήκευση…' : 'Αποθήκευση κοινοποίησης'}</Button>
        </div>
      </div>
    </Modal>
  );
}
