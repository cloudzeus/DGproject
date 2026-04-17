'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TenantUsersPanel } from './tenant-users-panel';
import { SoftOnePanel } from './softone-panel';

type Section = 'profile' | 'microsoft' | 'softone' | 'notifications' | 'license';

const SECTIONS: { id: Section; label: string; adminOnly?: boolean }[] = [
  { id: 'profile', label: 'Προφίλ' },
  { id: 'microsoft', label: 'Microsoft 365', adminOnly: true },
  { id: 'softone', label: 'SoftOne Integration', adminOnly: true },
  { id: 'notifications', label: 'Ειδοποιήσεις' },
  { id: 'license', label: 'Άδεια χρήσης' },
];

type UserInfo = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
};

type LicenseInfo = {
  serial: string;
  vendor: string;
  buyer: string;
  issuedOn: string | null;
  validUntil: string | null;
};

interface Props {
  user: UserInfo;
  license: LicenseInfo;
  isAdmin: boolean;
}

export function SettingsClient({ user, license, isAdmin }: Props) {
  const [section, setSection] = useState<Section>('profile');
  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95 mb-6">
        Ρυθμίσεις
      </h1>

      <div className="flex gap-8">
        <nav className="w-56 shrink-0">
          <div className="space-y-0.5">
            {visibleSections.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  'w-full text-left px-3 h-9 rounded-md text-sm font-medium transition-colors',
                  section === s.id
                    ? 'bg-fluent-blue-50 text-fluent-blue-700'
                    : 'text-fluent-neutral-70 hover:bg-black/5',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        <motion.div
          key={section}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-w-0"
        >
          {section === 'profile' && <ProfileSection user={user} />}
          {section === 'microsoft' && isAdmin && <TenantUsersPanel />}
          {section === 'softone' && isAdmin && <SoftOnePanel />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'license' && <LicenseSection license={license} />}
        </motion.div>
      </div>
    </div>
  );
}

function ProfileSection({ user }: { user: UserInfo }) {
  const roleLabel =
    ({ admin: 'Διαχειριστής', manager: 'Διευθυντής', member: 'Μέλος', viewer: 'Προβολή' } as Record<string, string>)[
      user.role
    ] ?? user.role;

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
      <h2 className="font-display text-xl font-semibold mb-1">Προφίλ</h2>
      <p className="text-sm text-fluent-neutral-60 mb-6">Τα προσωπικά σου στοιχεία.</p>
      <div className="flex items-center gap-4 mb-6">
        <Avatar user={{ name: user.name, avatarUrl: user.image ?? undefined }} size="lg" />
        <div>
          <Link href="/profile">
            <Button variant="secondary" size="sm">
              Επεξεργασία προφίλ
            </Button>
          </Link>
          <p className="text-xs text-fluent-neutral-60 mt-2">
            Αλλαγή ονόματος, φωτογραφίας ή κωδικού από τη σελίδα "Το προφίλ μου".
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <ReadonlyField label="Όνομα" value={user.name || '—'} />
        <ReadonlyField label="Email" value={user.email} />
        <ReadonlyField label="Ρόλος" value={roleLabel} />
        <ReadonlyField label="User ID" value={user.id} mono />
      </div>
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
      <h2 className="font-display text-xl font-semibold mb-1">Ειδοποιήσεις</h2>
      <p className="text-sm text-fluent-neutral-60 mb-4">
        Διαχείριση των ειδοποιήσεων που παίρνεις.
      </p>
      <div className="space-y-2">
        {[
          'Ανάθεση εργασίας σε εμένα',
          'Αναφορά (@mention) σε σχόλιο',
          'Προσεγγίζει η ημερομηνία λήξης',
          'Αλλαγές σε κατάσταση έργων',
          'Εβδομαδιαία σύνοψη μέσω email',
        ].map((label, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 border-b border-black/5 last:border-0"
          >
            <span className="text-sm text-fluent-neutral-80">{label}</span>
            <Toggle defaultOn={i < 3} />
          </div>
        ))}
      </div>
      <p className="text-xs text-fluent-neutral-50 mt-4">
        Οι ρυθμίσεις ειδοποιήσεων δεν αποθηκεύονται ακόμη — προσωρινά local state.
      </p>
    </div>
  );
}

function LicenseSection({ license }: { license: LicenseInfo }) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
        <h2 className="font-display text-xl font-semibold mb-1">Άδεια χρήσης λογισμικού</h2>
        <p className="text-sm text-fluent-neutral-60 mb-5">
          Στοιχεία αδειοδότησης και σειριακός αριθμός της εγκατάστασης.
        </p>

        <div className="bg-gradient-to-br from-fluent-blue-500 to-fluent-blue-700 text-white rounded-lg p-5 mb-5">
          <div className="text-[11px] uppercase tracking-wider text-white/70 mb-1">
            Σειριακός αριθμός
          </div>
          <div className="font-mono text-2xl font-semibold tracking-wider">{license.serial}</div>
        </div>

        <dl className="grid grid-cols-[180px_1fr] gap-y-3 text-sm">
          <dt className="text-fluent-neutral-60">Προμηθευτής</dt>
          <dd className="text-fluent-neutral-90 font-medium">{license.vendor}</dd>
          <dt className="text-fluent-neutral-60">Αγοραστής</dt>
          <dd className="text-fluent-neutral-90 font-medium">{license.buyer}</dd>
          <dt className="text-fluent-neutral-60">Ημ. έκδοσης</dt>
          <dd className="text-fluent-neutral-90">{license.issuedOn ?? '—'}</dd>
          <dt className="text-fluent-neutral-60">Ισχύει έως</dt>
          <dd className="text-fluent-neutral-90">{license.validUntil ?? 'Αόριστη'}</dd>
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
        <h3 className="font-display font-semibold text-fluent-neutral-90 mb-3">
          Όροι και προϋποθέσεις χρήσης
        </h3>
        <div className="prose prose-sm max-w-none text-fluent-neutral-80 space-y-3 leading-relaxed">
          <p>
            <strong>1. Αντικείμενο.</strong> Η παρούσα άδεια παραχωρεί στον Αγοραστή το
            μη-αποκλειστικό και μη-μεταβιβάσιμο δικαίωμα χρήσης του λογισμικού με τον σειριακό
            αριθμό που αναγράφεται ανωτέρω, σύμφωνα με τα όσα ορίζονται στους παρόντες όρους.
          </p>
          <p>
            <strong>2. Περιορισμοί.</strong> Δεν επιτρέπεται η αντιγραφή, τροποποίηση,
            αποσυμπίληση, ή η διανομή του λογισμικού σε τρίτους χωρίς την έγγραφη συγκατάθεση
            του Προμηθευτή. Η άδεια αφορά μία (1) εγκατάσταση και δεν μπορεί να χρησιμοποιηθεί
            παράλληλα σε πολλαπλά περιβάλλοντα χωρίς πρόσθετη άδεια.
          </p>
          <p>
            <strong>3. Υποστήριξη και ενημερώσεις.</strong> Ο Προμηθευτής παρέχει τεχνική
            υποστήριξη και ενημερώσεις για την περίοδο ισχύος της άδειας. Μετά τη λήξη της
            περιόδου, η υποστήριξη ανανεώνεται μόνο κατόπιν νέας συμφωνίας.
          </p>
          <p>
            <strong>4. Ευθύνη.</strong> Ο Προμηθευτής δεν ευθύνεται για απώλεια δεδομένων,
            διαφυγόντα κέρδη ή έμμεσες ζημιές που ενδέχεται να προκύψουν από τη χρήση του
            λογισμικού. Ο Αγοραστής οφείλει να τηρεί τακτικά αντίγραφα ασφαλείας των δεδομένων του.
          </p>
          <p>
            <strong>5. Προστασία δεδομένων.</strong> Η επεξεργασία προσωπικών δεδομένων γίνεται
            σύμφωνα με τον Κανονισμό GDPR (EU 2016/679). Ο Αγοραστής είναι υπεύθυνος για τις
            νόμιμες βάσεις επεξεργασίας των δεδομένων που αποθηκεύει στο σύστημα.
          </p>
          <p>
            <strong>6. Καταγγελία.</strong> Παραβίαση οποιουδήποτε όρου επιφέρει αυτόματη λύση
            της άδειας χρήσης, με υποχρέωση του Αγοραστή για διαγραφή του λογισμικού και κάθε
            αντιγράφου εντός τριάντα (30) ημερών.
          </p>
          <p>
            <strong>7. Εφαρμοστέο δίκαιο.</strong> Οι παρόντες όροι διέπονται από το ελληνικό
            δίκαιο. Αρμόδια για την επίλυση τυχόν διαφορών ορίζονται τα δικαστήρια Αθηνών.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReadonlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 mb-1 block">
        {label}
      </label>
      <input
        readOnly
        value={value}
        className={cn(
          'w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm bg-fluent-neutral-4 text-fluent-neutral-90 focus:outline-none',
          mono && 'font-mono text-xs',
        )}
      />
    </div>
  );
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(!on)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors shrink-0',
        on ? 'bg-fluent-blue-500' : 'bg-fluent-neutral-20',
      )}
    >
      <motion.div
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
        animate={{ left: on ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
