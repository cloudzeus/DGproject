'use client';

import { useState, useTransition } from 'react';
import { signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Eye20Regular,
  EyeOff20Regular,
  ShieldCheckmark20Filled,
  CheckmarkCircle20Filled,
  DismissCircle20Filled,
  LockClosed20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { changePasswordOnFirstLogin } from './actions';

type PwdRule = { id: string; label: string; test: (s: string, currentTemp: string) => boolean };

const RULES: PwdRule[] = [
  { id: 'len', label: 'Τουλάχιστον 8 χαρακτήρες', test: (s) => s.length >= 8 },
  { id: 'alpha', label: 'Περιέχει γράμμα', test: (s) => /[A-Za-z]/.test(s) },
  { id: 'digit', label: 'Περιέχει αριθμό', test: (s) => /[0-9]/.test(s) },
  {
    id: 'diff',
    label: 'Διαφέρει από τον προσωρινό',
    test: (s, t) => s.length > 0 && s !== t,
  },
];

export function ChangePasswordForm({ userEmail, userName }: { userEmail: string; userName: string }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const ruleResults = RULES.map((r) => ({ ...r, ok: r.test(newPassword, currentPassword) }));
  const allValid = ruleResults.every((r) => r.ok);
  const matchOk = newPassword.length > 0 && newPassword === confirmPassword;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!allValid) {
      setError('Ο κωδικός δεν πληροί όλους τους κανόνες.');
      return;
    }
    if (!matchOk) {
      setError('Οι κωδικοί δεν ταιριάζουν.');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('currentPassword', currentPassword);
      fd.set('newPassword', newPassword);
      fd.set('confirmPassword', confirmPassword);
      const res = await changePasswordOnFirstLogin(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      // Force a fresh sign-in: the user's JWT still has mustChangePassword=true,
      // so signing them out and bouncing to signin guarantees they log in with the
      // new password and get a clean session token.
      setTimeout(() => {
        signOut({ callbackUrl: '/auth/signin?changed=1' });
      }, 900);
    });
  }

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-fluent-16 p-8 max-w-md w-full text-center"
      >
        <div className="h-14 w-14 rounded-full bg-fluent-accent-green/10 flex items-center justify-center mx-auto mb-3">
          <ShieldCheckmark20Filled className="h-8 w-8 text-fluent-accent-green" />
        </div>
        <h1 className="font-display text-xl font-semibold text-fluent-neutral-95 mb-1">
          Ο κωδικός άλλαξε επιτυχώς
        </h1>
        <p className="text-sm text-fluent-neutral-60">
          Για ασφάλεια θα αποσυνδεθείς και θα σε επιστρέψουμε στη σελίδα σύνδεσης…
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-fluent-16 p-8 max-w-md w-full"
    >
      <div className="flex items-center gap-3 mb-1">
        <div className="h-10 w-10 rounded-xl bg-fluent-blue-50 flex items-center justify-center">
          <LockClosed20Regular className="h-5 w-5 text-fluent-blue-600" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-fluent-neutral-95">
            Όρισε νέο κωδικό
          </h1>
          <p className="text-xs text-fluent-neutral-60">
            Προστασία για τον λογαριασμό σου
          </p>
        </div>
      </div>

      <div className="bg-fluent-blue-50 border border-fluent-blue-200 text-fluent-blue-800 text-sm rounded-lg px-3 py-2 mt-4 mb-5">
        Συνδέθηκες με προσωρινό κωδικό. Πριν συνεχίσεις, παρακαλώ όρισε έναν νέο, προσωπικό κωδικό
        για τον λογαριασμό <strong className="font-semibold">{userName || userEmail}</strong>.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="Προσωρινός κωδικός"
          value={currentPassword}
          onChange={setCurrentPassword}
          show={showCurrent}
          onToggle={() => setShowCurrent((v) => !v)}
          autoComplete="current-password"
          placeholder="Από το email σου"
        />

        <PasswordField
          label="Νέος κωδικός"
          value={newPassword}
          onChange={setNewPassword}
          show={showNew}
          onToggle={() => setShowNew((v) => !v)}
          autoComplete="new-password"
        />

        <ul className="space-y-1">
          {ruleResults.map((r) => (
            <li
              key={r.id}
              className={`text-xs inline-flex items-center gap-1.5 mr-3 ${r.ok ? 'text-fluent-accent-green' : 'text-fluent-neutral-60'}`}
            >
              {r.ok ? (
                <CheckmarkCircle20Filled className="h-3.5 w-3.5" />
              ) : (
                <DismissCircle20Filled className="h-3.5 w-3.5 text-fluent-neutral-30" />
              )}
              {r.label}
            </li>
          ))}
        </ul>

        <PasswordField
          label="Επιβεβαίωση νέου κωδικού"
          value={confirmPassword}
          onChange={setConfirmPassword}
          show={showNew}
          onToggle={() => setShowNew((v) => !v)}
          autoComplete="new-password"
        />
        {confirmPassword.length > 0 && (
          <p
            className={`text-xs inline-flex items-center gap-1.5 ${matchOk ? 'text-fluent-accent-green' : 'text-red-700'}`}
          >
            {matchOk ? (
              <CheckmarkCircle20Filled className="h-3.5 w-3.5" />
            ) : (
              <DismissCircle20Filled className="h-3.5 w-3.5" />
            )}
            {matchOk ? 'Ταιριάζουν' : 'Οι κωδικοί δεν ταιριάζουν'}
          </p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={pending || !allValid || !matchOk || currentPassword.length === 0}
        >
          {pending ? 'Αποθήκευση…' : 'Αλλαγή κωδικού'}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/auth/signin' })}
        className="mt-4 text-xs text-fluent-neutral-60 hover:text-fluent-neutral-90 underline w-full text-center"
      >
        Αποσύνδεση
      </button>
    </motion.div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-fluent-neutral-70 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          className="w-full h-11 pl-3 pr-10 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
          aria-label={show ? 'Απόκρυψη' : 'Εμφάνιση'}
        >
          {show ? <EyeOff20Regular className="h-4 w-4" /> : <Eye20Regular className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
