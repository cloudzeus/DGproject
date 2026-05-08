'use client';

import { useEffect, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  Mail20Regular,
  Key20Regular,
  Globe20Regular,
  Eye20Regular,
  EyeOff20Regular,
  Send20Regular,
  CheckmarkCircle20Filled,
  DismissCircle20Filled,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getMailgunSettings,
  saveMailgunSettings,
  sendMailgunTest,
  type MailgunSettingsView,
} from './mailgun-actions';

type SourceTone = 'db' | 'env' | 'derived' | 'default' | 'none';

const SOURCE_LABEL: Record<SourceTone, string> = {
  db: 'Από ρυθμίσεις',
  env: 'Από .env',
  derived: 'Αυτόματο',
  default: 'Προεπιλογή',
  none: 'Δεν έχει οριστεί',
};

export function MailgunPanel({ initial, currentUserEmail }: { initial: MailgunSettingsView | null; currentUserEmail: string }) {
  const [settings, setSettings] = useState<MailgunSettingsView | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    setLoading(true);
    getMailgunSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Σφάλμα φόρτωσης.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initial]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
        <p className="text-sm text-fluent-neutral-60">Φόρτωση…</p>
      </div>
    );
  }
  if (error || !settings) {
    return (
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
        <p className="text-sm text-red-700">{error ?? 'Σφάλμα.'}</p>
      </div>
    );
  }

  return (
    <MailgunForm
      settings={settings}
      currentUserEmail={currentUserEmail}
      onSaved={(next) => setSettings(next)}
    />
  );
}

function MailgunForm({
  settings,
  currentUserEmail,
  onSaved,
}: {
  settings: MailgunSettingsView;
  currentUserEmail: string;
  onSaved: (next: MailgunSettingsView) => void;
}) {
  const [domain, setDomain] = useState(settings.domain);
  const [region, setRegion] = useState<'us' | 'eu'>(settings.region);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [fromName, setFromName] = useState(settings.fromName);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyMode, setApiKeyMode] = useState<'keep' | 'set' | 'clear'>('keep');
  const [showKey, setShowKey] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [savePending, startSaveTransition] = useTransition();

  const [testTo, setTestTo] = useState(currentUserEmail);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testPending, startTestTransition] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);
    startSaveTransition(async () => {
      const fd = new FormData();
      fd.set('domain', domain.trim());
      fd.set('region', region);
      fd.set('fromEmail', fromEmail.trim());
      fd.set('fromName', fromName.trim());
      fd.set('apiKeyAction', apiKeyMode);
      if (apiKeyMode === 'set') fd.set('apiKey', apiKeyInput);

      const res = await saveMailgunSettings(fd);
      if (!res.ok) {
        setSaveError(res.error ?? 'Σφάλμα.');
        return;
      }
      setSaveSuccess('Οι ρυθμίσεις αποθηκεύτηκαν.');
      setApiKeyInput('');
      setApiKeyMode('keep');
      setShowKey(false);
      try {
        const next = await getMailgunSettings();
        onSaved(next);
      } catch {
        // best-effort refresh
      }
      setTimeout(() => setSaveSuccess(null), 3000);
    });
  }

  function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setTestStatus(null);
    startTestTransition(async () => {
      const fd = new FormData();
      fd.set('to', testTo.trim());
      const res = await sendMailgunTest(fd);
      if (!res.ok) {
        setTestStatus({ ok: false, message: res.error ?? 'Αποτυχία αποστολής.' });
        return;
      }
      setTestStatus({
        ok: true,
        message: res.messageId
          ? `Στάλθηκε. Message ID: ${res.messageId}`
          : 'Στάλθηκε. Έλεγξε τα εισερχόμενά σου.',
      });
    });
  }

  const isConfigured = settings.apiKeyConfigured && settings.domain && settings.fromEmail;

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold mb-1 inline-flex items-center gap-2">
              <Mail20Regular className="h-5 w-5 text-fluent-blue-600" /> Mailgun
            </h2>
            <p className="text-sm text-fluent-neutral-60">
              Ρυθμίσεις αποστολής email για ειδοποιήσεις (αναθέσεις, ερωτήσεις, απαντήσεις).
            </p>
          </div>
          <StatusBadge configured={Boolean(isConfigured)} />
        </div>

        {/* API Key */}
        <Field
          label="API Key"
          icon={<Key20Regular className="h-4 w-4" />}
          source={settings.source.apiKey}
        >
          {settings.apiKeyConfigured && apiKeyMode === 'keep' ? (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={settings.apiKeyMasked}
                className="flex-1 h-10 px-3 rounded-md border border-fluent-neutral-20 bg-fluent-neutral-4 text-sm font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setApiKeyMode('set');
                  setApiKeyInput('');
                  setShowKey(true);
                }}
              >
                Αλλαγή
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setApiKeyMode('clear')}
              >
                Διαγραφή
              </Button>
            </div>
          ) : apiKeyMode === 'clear' ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-10 px-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700 flex items-center">
                Το API key θα διαγραφεί κατά την αποθήκευση.
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setApiKeyMode('keep')}
              >
                Ακύρωση
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={settings.apiKeyConfigured ? 'Εισήγαγε νέο API key' : 'Εισήγαγε API key'}
                  autoComplete="off"
                  className="w-full h-10 pl-3 pr-10 rounded-md border border-fluent-neutral-20 bg-white text-sm font-mono focus:border-fluent-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
                  aria-label={showKey ? 'Απόκρυψη' : 'Εμφάνιση'}
                >
                  {showKey ? <EyeOff20Regular className="h-4 w-4" /> : <Eye20Regular className="h-4 w-4" />}
                </button>
              </div>
              {settings.apiKeyConfigured && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setApiKeyMode('keep');
                    setApiKeyInput('');
                    setShowKey(false);
                  }}
                >
                  Ακύρωση
                </Button>
              )}
            </div>
          )}
          <p className="text-[11px] text-fluent-neutral-60 mt-1">
            Το API key αποθηκεύεται στη βάση και χρησιμοποιείται μόνο από τον server. Δεν επιστρέφεται ποτέ μη μασκαρισμένο.
          </p>
        </Field>

        {/* Domain */}
        <Field
          label="Domain"
          icon={<Globe20Regular className="h-4 w-4" />}
          source={settings.source.domain}
        >
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="mg.example.com"
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
          <p className="text-[11px] text-fluent-neutral-60 mt-1">
            Το επιβεβαιωμένο sending domain στο Mailgun (π.χ. <code>mg.yourcompany.com</code>).
          </p>
        </Field>

        {/* Region */}
        <Field label="Περιοχή server" source={settings.source.region}>
          <div className="inline-flex bg-fluent-neutral-4 rounded-lg p-1">
            {(['us', 'eu'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                className={cn(
                  'h-8 px-4 rounded-md text-sm font-semibold transition-colors',
                  region === r
                    ? 'bg-white text-fluent-blue-700 shadow-fluent-2'
                    : 'text-fluent-neutral-70 hover:bg-white/60',
                )}
              >
                {r === 'us' ? '🇺🇸 US (api.mailgun.net)' : '🇪🇺 EU (api.eu.mailgun.net)'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-fluent-neutral-60 mt-1">
            Πρέπει να ταιριάζει με την περιοχή του Mailgun account σου. Λάθος περιοχή προκαλεί <strong>401
            Unauthorized</strong>.
          </p>
        </Field>

        {/* From email + name */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
          <Field label="Email αποστολέα" source={settings.source.fromEmail}>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={`noreply@${domain || 'yourdomain.com'}`}
              className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
            <p className="text-[11px] text-fluent-neutral-60 mt-1">
              Η διεύθυνση από την οποία θα φεύγουν τα emails του συστήματος.
            </p>
          </Field>
          <Field label="Όνομα αποστολέα" source={settings.source.fromName}>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="A-Sisyphus"
              className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
            <p className="text-[11px] text-fluent-neutral-60 mt-1">Προαιρετικό.</p>
          </Field>
        </div>

        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-fluent-accent-green/10 border border-fluent-accent-green/30 text-fluent-accent-green px-3 py-2 rounded-md text-sm inline-flex items-center gap-2"
          >
            <CheckmarkCircle20Filled className="h-4 w-4" /> {saveSuccess}
          </motion.div>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md" disabled={savePending}>
            {savePending ? 'Αποθήκευση…' : 'Αποθήκευση ρυθμίσεων'}
          </Button>
        </div>
      </form>

      {/* Test panel */}
      <form
        onSubmit={handleTest}
        className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6 space-y-3"
      >
        <h3 className="font-display text-base font-semibold inline-flex items-center gap-2">
          <Send20Regular className="h-4 w-4 text-fluent-blue-600" /> Δοκιμή σύνδεσης
        </h3>
        <p className="text-sm text-fluent-neutral-60">
          Στείλε ένα δοκιμαστικό email για να επιβεβαιώσεις ότι οι ρυθμίσεις λειτουργούν.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="δοκιμαστικός παραλήπτης"
            className="flex-1 min-w-[240px] h-10 px-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
          <Button
            type="submit"
            variant="secondary"
            size="md"
            icon={<Send20Regular className="h-4 w-4" />}
            disabled={testPending || !isConfigured}
          >
            {testPending ? 'Αποστολή…' : 'Αποστολή δοκιμής'}
          </Button>
        </div>
        {!isConfigured && (
          <p className="text-[12px] text-fluent-accent-orange">
            Συμπλήρωσε API key, domain και email αποστολέα και αποθήκευσε προτού δοκιμάσεις.
          </p>
        )}
        {testStatus && (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'px-3 py-2 rounded-md text-sm inline-flex items-center gap-2',
              testStatus.ok
                ? 'bg-fluent-accent-green/10 border border-fluent-accent-green/30 text-fluent-accent-green'
                : 'bg-red-50 border border-red-200 text-red-700',
            )}
          >
            {testStatus.ok ? (
              <CheckmarkCircle20Filled className="h-4 w-4" />
            ) : (
              <DismissCircle20Filled className="h-4 w-4" />
            )}
            {testStatus.message}
          </motion.div>
        )}
      </form>
    </div>
  );
}

function Field({
  label,
  icon,
  source,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  source?: SourceTone;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fluent-neutral-70">
          {icon}
          {label}
        </span>
        {source && <SourcePill source={source} />}
      </label>
      {children}
    </div>
  );
}

function SourcePill({ source }: { source: SourceTone }) {
  const tone =
    source === 'db'
      ? 'bg-fluent-blue-50 text-fluent-blue-700 border-fluent-blue-200'
      : source === 'env'
      ? 'bg-fluent-accent-orange/10 text-fluent-accent-orange border-fluent-accent-orange/30'
      : source === 'none'
      ? 'bg-fluent-neutral-8 text-fluent-neutral-70 border-fluent-neutral-20'
      : 'bg-fluent-neutral-4 text-fluent-neutral-70 border-fluent-neutral-20';
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide',
        tone,
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-fluent-accent-green/10 text-fluent-accent-green text-xs font-semibold">
        <CheckmarkCircle20Filled className="h-4 w-4" /> Ενεργό
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-fluent-accent-orange/10 text-fluent-accent-orange text-xs font-semibold">
      <DismissCircle20Filled className="h-4 w-4" /> Ανενεργό
    </span>
  );
}
