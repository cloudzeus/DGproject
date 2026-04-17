'use client';

import { useMemo, useState } from 'react';
import { TaskForm, TaskModal, type TaskAssigneeOption, type TaskFormInitial } from '@/app/(app)/projects/[id]/task-form';
import { createTask, updateTask } from '@/app/(app)/projects/[id]/task-actions';

export type BoardProjectOption = {
  id: string;
  name: string;
  color: string;
  members: TaskAssigneeOption[];
};

type CreateProps = {
  mode: 'create';
  projects: BoardProjectOption[];
  defaultProjectId?: string;
  onClose: () => void;
};

type EditProps = {
  mode: 'edit';
  projectId: string;
  taskId: string;
  members: TaskAssigneeOption[];
  initial: TaskFormInitial;
  onClose: () => void;
};

type Props = CreateProps | EditProps;

export function BoardTaskModal(props: Props) {
  if (props.mode === 'edit') return <EditModal {...props} />;
  return <CreateModal {...props} />;
}

function CreateModal({ projects, defaultProjectId, onClose }: CreateProps) {
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? projects[0]?.id ?? '');

  const members = useMemo(
    () => projects.find((p) => p.id === projectId)?.members ?? [],
    [projects, projectId],
  );

  if (projects.length === 0) {
    return (
      <TaskModal title="Νέα εργασία" onClose={onClose}>
        <p className="text-sm text-fluent-neutral-70">
          Δεν έχεις πρόσβαση σε κανένα έργο. Ζήτα πρόσβαση από έναν διαχειριστή.
        </p>
      </TaskModal>
    );
  }

  return (
    <TaskModal title="Νέα εργασία" onClose={onClose}>
      <div className="mb-4">
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Έργο</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <TaskForm
        key={projectId}
        members={members}
        submitLabel="Δημιουργία"
        onCancel={onClose}
        onSubmit={async (fd) => {
          if (!projectId) return { ok: false, error: 'Επίλεξε έργο.' };
          const res = await createTask(projectId, fd);
          if (res.ok) onClose();
          return res;
        }}
      />
    </TaskModal>
  );
}

function EditModal({ projectId, taskId, members, initial, onClose }: EditProps) {
  return (
    <TaskModal title="Επεξεργασία εργασίας" onClose={onClose}>
      <TaskForm
        members={members}
        submitLabel="Αποθήκευση"
        projectId={projectId}
        taskId={taskId}
        initial={initial}
        onCancel={onClose}
        onSubmit={async (fd) => {
          const res = await updateTask(projectId, taskId, fd);
          if (res.ok) onClose();
          return res;
        }}
      />
    </TaskModal>
  );
}
