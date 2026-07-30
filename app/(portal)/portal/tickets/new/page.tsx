import Link from 'next/link';
import { PortalNewTicketForm } from './portal-new-ticket-form';

export const dynamic = 'force-dynamic';

export default function PortalNewTicket() {
  return (
    <div className="max-w-xl">
      <Link href="/portal/tickets" className="text-xs text-fluent-blue-600">
        ← Αιτήματα
      </Link>
      <h1 className="mt-1 text-2xl font-semibold text-fluent-neutral-90">Νέο αίτημα</h1>
      <p className="mt-1 text-sm text-fluent-neutral-60">
        Περιγράψτε το θέμα. Θα λάβετε email επιβεβαίωσης και θα μπορείτε να παρακολουθείτε
        την πορεία του εδώ.
      </p>
      <PortalNewTicketForm />
    </div>
  );
}
