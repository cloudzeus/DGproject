'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { PortalNewTicketForm } from './new/portal-new-ticket-form';

/**
 * Το «Νέο αίτημα» ανοίγει modal αντί να πλοηγεί σε δική του σελίδα.
 *
 * Ο πελάτης δεν χάνει τη λίστα των αιτημάτων του όσο γράφει, και το Escape
 * τον γυρίζει πίσω χωρίς navigation. Η διαδρομή /portal/tickets/new μένει
 * ενεργή για bookmarks και για συνδέσμους από email.
 */
export function NewTicketButton({
  className,
  children = 'Νέο αίτημα',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      {open && (
        <Modal
          title="Νέο αίτημα"
          description="Περιγράψτε το θέμα. Θα λάβετε email επιβεβαίωσης και θα μπορείτε να παρακολουθείτε την πορεία του εδώ."
          onClose={() => setOpen(false)}
        >
          <PortalNewTicketForm onCancel={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
