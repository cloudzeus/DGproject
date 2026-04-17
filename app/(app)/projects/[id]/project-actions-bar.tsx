'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { Edit20Regular, Delete20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { ProjectForm, ProjectModal, type UserOption } from '../project-form';
import { updateProject, deleteProject } from '../actions';

type Status = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

type Props = {
  project: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    status: Status;
    dueDate: Date | null;
    ownerId: string;
    memberIds: string[];
  };
  users: UserOption[];
  canEdit: boolean;
};

export function ProjectActionsBar({ project, users, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  function handleDelete() {
    if (!confirm(`Να διαγραφεί το έργο "${project.name}"; Αυτή η ενέργεια είναι μη αναστρέψιμη.`)) return;
    startTransition(async () => {
      await deleteProject(project.id);
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={<Edit20Regular />} onClick={() => setEditing(true)}>
          Επεξεργασία
        </Button>
        <Button variant="danger" size="sm" icon={<Delete20Regular />} onClick={handleDelete} disabled={pending}>
          Διαγραφή
        </Button>
      </div>
      <AnimatePresence>
        {editing && (
          <ProjectModal title="Επεξεργασία έργου" onClose={() => setEditing(false)}>
            <ProjectForm
              users={users}
              initial={{
                name: project.name,
                description: project.description,
                color: project.color,
                status: project.status,
                dueDate: project.dueDate,
                ownerId: project.ownerId,
                memberIds: project.memberIds,
              }}
              submitLabel="Αποθήκευση"
              onCancel={() => setEditing(false)}
              onSubmit={async (fd) => {
                const res = await updateProject(project.id, fd);
                if (res?.ok) {
                  setEditing(false);
                  router.refresh();
                  return res;
                }
                return res ?? { ok: false };
              }}
            />
          </ProjectModal>
        )}
      </AnimatePresence>
    </>
  );
}
