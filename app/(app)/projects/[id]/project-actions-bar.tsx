'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { Edit20Regular, Delete20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { ProjectForm, ProjectModal, type UserOption } from '../project-form';
import { updateProject, deleteProject } from '../actions';
import { ScheduleMeetingButton } from './schedule-meeting-button';

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
  /** Logged-in user's email — used as default Teams meeting organizer. */
  sessionEmail: string;
};

export function ProjectActionsBar({ project, users, canEdit, sessionEmail }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  // The Schedule Meeting button is available to anyone with project access
  // even if they can't edit the project itself.
  const memberOptions = users
    .filter((u) => project.memberIds.includes(u.id) || u.id === project.ownerId)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2">
        <ScheduleMeetingButton
          projectId={project.id}
          projectName={project.name}
          members={memberOptions}
          sessionEmail={sessionEmail}
        />
      </div>
    );
  }

  function handleDelete() {
    if (!confirm(`Να διαγραφεί το έργο "${project.name}"; Αυτή η ενέργεια είναι μη αναστρέψιμη.`)) return;
    startTransition(async () => {
      await deleteProject(project.id);
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <ScheduleMeetingButton
          projectId={project.id}
          projectName={project.name}
          members={memberOptions}
          sessionEmail={sessionEmail}
        />
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
