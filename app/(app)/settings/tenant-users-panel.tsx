'use client';

import { useMemo, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowSync20Regular, CheckmarkCircle16Filled, Search20Regular, PeopleAdd20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { fetchTenantDirectory, importTenantUsers, type FetchTenantResult, type TenantRow } from './actions';

type Role = 'admin' | 'manager' | 'member' | 'viewer';
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Διαχειριστής' },
  { value: 'manager', label: 'Διευθυντής' },
  { value: 'member', label: 'Μέλος' },
  { value: 'viewer', label: 'Προβολή' },
];

export function TenantUsersPanel() {
  const [state, setState] = useState<FetchTenantResult | null>(null);
  const [selected, setSelected] = useState<Record<string, Role>>({});
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function handleFetch() {
    setImportResult(null);
    setImportError(null);
    startTransition(async () => {
      const res = await fetchTenantDirectory();
      setState(res);
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = 'member';
      return next;
    });
  }

  function setRole(id: string, role: Role) {
    setSelected((prev) => ({ ...prev, [id]: role }));
  }

  function handleImport() {
    const entries = Object.entries(selected);
    if (entries.length === 0) return;
    setImportResult(null);
    setImportError(null);
    startTransition(async () => {
      const res = await importTenantUsers(entries.map(([id, role]) => ({ id, role })));
      if (res.ok) {
        setImportResult(`Εισήχθησαν ${res.created} νέοι, ενημερώθηκαν ${res.updated}.`);
        setSelected({});
        const refreshed = await fetchTenantDirectory();
        setState(refreshed);
      } else {
        setImportError(res.error ?? 'Αποτυχία εισαγωγής.');
      }
    });
  }

  const filtered = useMemo(() => {
    if (!state || !state.ok) return [];
    const q = query.trim().toLowerCase();
    if (!q) return state.users;
    return state.users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department ?? '').toLowerCase().includes(q) ||
        (u.jobTitle ?? '').toLowerCase().includes(q),
    );
  }, [state, query]);

  const selectedCount = Object.keys(selected).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold mb-1">Microsoft 365 Directory</h2>
            <p className="text-sm text-fluent-neutral-60">
              Συνδεθείτε στο Azure AD tenant της εταιρείας και εισάγετε χρήστες στην εφαρμογή.
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            icon={<ArrowSync20Regular />}
            disabled={pending}
            onClick={handleFetch}
          >
            {state ? 'Ανανέωση' : 'Σύνδεση'}
          </Button>
        </div>

        {state && state.ok && (
          <div className="mt-4 flex items-center gap-3 p-3 bg-fluent-blue-50 border border-fluent-blue-200 rounded-lg">
            <div className="h-9 w-9 rounded-md bg-fluent-blue-500 text-white flex items-center justify-center font-bold text-sm">M</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fluent-neutral-90 truncate">
                {state.tenant?.displayName ?? 'Συνδεδεμένος tenant'}
              </p>
              <p className="text-xs text-fluent-neutral-60 truncate">
                {state.tenant?.defaultDomain ?? 'Azure AD'} · {state.users.length} χρήστες
              </p>
            </div>
            <CheckmarkCircle16Filled className="text-fluent-accent-green h-5 w-5" />
          </div>
        )}

        {state && !state.ok && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <p className="font-semibold">Αποτυχία σύνδεσης</p>
            <p className="mt-0.5 text-xs break-all">{state.error}</p>
            {!state.configured && (
              <p className="mt-2 text-xs">
                Ορίστε τις μεταβλητές περιβάλλοντος <code>TENANT_ID</code>, <code>APPLICATION_ID</code> και{' '}
                <code>CLIENT_SECRET_VALUE</code> και χορηγήστε στο application το δικαίωμα{' '}
                <code>User.Read.All</code> (Application) με admin consent.
              </p>
            )}
          </div>
        )}
      </div>

      {state && state.ok && (
        <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
          <div className="p-4 border-b border-black/5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Αναζήτηση ονόματος, email, τμήματος…"
                className="w-full h-9 pl-9 pr-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
              />
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<PeopleAdd20Regular />}
              disabled={selectedCount === 0 || pending}
              onClick={handleImport}
            >
              {pending ? 'Εισαγωγή…' : `Εισαγωγή (${selectedCount})`}
            </Button>
          </div>

          <AnimatePresence>
            {importResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-2 bg-green-50 border-b border-green-200 text-green-700 text-sm"
              >
                {importResult}
              </motion.div>
            )}
            {importError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm"
              >
                {importError}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="max-h-[520px] overflow-y-auto divide-y divide-black/5">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-fluent-neutral-60">
                Κανένας χρήστης δεν ταιριάζει.
              </div>
            ) : (
              filtered.map((u) => (
                <TenantRowView
                  key={u.id}
                  user={u}
                  selectedRole={selected[u.id]}
                  onToggle={() => toggle(u.id)}
                  onRoleChange={(r) => setRole(u.id, r)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TenantRowView({
  user,
  selectedRole,
  onToggle,
  onRoleChange,
}: {
  user: TenantRow;
  selectedRole: Role | undefined;
  onToggle: () => void;
  onRoleChange: (r: Role) => void;
}) {
  const isSelected = Boolean(selectedRole);
  return (
    <label className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${isSelected ? 'bg-fluent-blue-50/60' : 'hover:bg-fluent-neutral-4'}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        disabled={user.existing}
        className="h-4 w-4 accent-fluent-blue-600 shrink-0 disabled:opacity-40"
      />
      <div className="h-9 w-9 rounded-full bg-fluent-blue-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">
        {(user.displayName || user.email).slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-fluent-neutral-90 truncate">{user.displayName || user.email}</p>
          {user.existing && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-fluent-neutral-8 text-fluent-neutral-70">
              Ήδη υπάρχει{user.existingRole ? ` · ${user.existingRole}` : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-fluent-neutral-60 truncate">{user.email}</p>
        {(user.jobTitle || user.department) && (
          <p className="text-[11px] text-fluent-neutral-50 truncate">
            {[user.jobTitle, user.department].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {isSelected && !user.existing && (
        <select
          value={selectedRole}
          onChange={(e) => onRoleChange(e.target.value as Role)}
          onClick={(e) => e.stopPropagation()}
          className="h-8 px-2 rounded-md border border-fluent-neutral-20 text-xs bg-white focus:border-fluent-blue-500 focus:outline-none"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      )}
    </label>
  );
}
