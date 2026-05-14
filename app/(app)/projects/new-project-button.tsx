'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Add16Filled } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { ProjectForm, ProjectModal, type UserOption } from './project-form';
import { createProject } from './actions';

type Props = {
  users: UserOption[];
  currentUserId: string;
  canCreate: boolean;
};

export function NewProjectButton({ users, currentUserId, canCreate }: Props) {
  const [open, setOpen] = useState(false);

  if (!canCreate) return null;

  return (
    <>
      <Button variant="primary" size="md" icon={<Add16Filled />} onClick={() => setOpen(true)}>
        Νέο έργο
      </Button>
      <AnimatePresence>
        {open && (
          <ProjectModal title="Νέο έργο" onClose={() => setOpen(false)}>
            <ProjectForm
              users={users}
              initial={{
                name: '',
                description: null,
                color: '#0078D4',
                status: 'planning',
                dueDate: null,
                ownerId: currentUserId,
                memberIds: [],
              }}
              submitLabel="Δημιουργία"
              onCancel={() => setOpen(false)}
              onSubmit={async (fd) => {
                // createProject either returns { ok: false, error } on validation /
                // permission failure or calls redirect() on success (which navigates
                // away and never returns). Without forwarding the result, the form
                // had no way to surface validation errors — the modal just sat there
                // and the user saw nothing happen.
                try {
                  const res = await createProject(fd);
                  return res ?? { ok: true };
                } catch (err: unknown) {
                  // Let Next.js handle redirect / not-found signals from server actions.
                  const digest = (err as { digest?: string } | null)?.digest;
                  if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))) {
                    throw err;
                  }
                  const message = err instanceof Error ? err.message : 'Σφάλμα δημιουργίας έργου.';
                  return { ok: false, error: message };
                }
              }}
            />
          </ProjectModal>
        )}
      </AnimatePresence>
    </>
  );
}
