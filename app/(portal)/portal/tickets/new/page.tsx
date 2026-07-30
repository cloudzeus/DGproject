import Link from 'next/link';
import { PortalNewTicketForm } from './portal-new-ticket-form';

export const dynamic = 'force-dynamic';

export default function PortalNewTicket() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/portal/tickets" className="text-xs text-fluent-blue-600">
        ← Αιτήματα
      </Link>
      <div className="mt-2 rounded-xl border border-fluent-neutral-10 bg-white p-6 shadow-fluent-2 sm:p-7">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fluent-neutral-90">
          Νέο αίτημα
        </h1>
        <p className="mt-1 text-sm text-fluent-neutral-60">
          Περιγράψτε το θέμα. Θα λάβετε email επιβεβαίωσης και θα μπορείτε να παρακολουθείτε
          την πορεία του εδώ.
        </p>
        <PortalNewTicketForm />
      </div>
    </div>
  );
}
