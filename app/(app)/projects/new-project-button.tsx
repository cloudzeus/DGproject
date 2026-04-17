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
                await createProject(fd);
              }}
            />
          </ProjectModal>
        )}
      </AnimatePresence>
    </>
  );
}
