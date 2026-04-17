'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MoreHorizontal20Regular,
  Calendar16Regular,
  CheckmarkCircle16Regular,
  Filter20Regular,
  Open20Regular,
  Edit20Regular,
  Delete20Regular,
} from '@fluentui/react-icons';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, statusLabel } from '@/lib/utils';
import { NewProjectButton } from './new-project-button';
import { ProjectForm, ProjectModal, type UserOption } from './project-form';
import { updateProject, deleteProject } from './actions';

type Status = 'active' | 'planning' | 'on_hold' | 'completed' | 'archived';

type ProjectWithRelations = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: Status;
  dueDate: Date | null;
  ownerId: string;
  memberIds: string[];
  members: Array<{ name: string; avatarUrl?: string }>;
  tasks: Array<{ id: string; status: string }>;
  canEdit: boolean;
};

export function ProjectsGrid({
  projects,
  users,
  currentUserId,
  canCreate,
}: {
  projects: ProjectWithRelations[];
  users: UserOption[];
  currentUserId: string;
  canCreate: boolean;
}) {
  const [editingProject, setEditingProject] = useState<ProjectWithRelations | null>(null);

  return (
    <>
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">Έργα</h1>
        <p className="text-fluent-neutral-60 mt-1">{projects.length} {projects.length === 1 ? 'έργο' : 'έργα'}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="md" icon={<Filter20Regular />}>Φίλτρο</Button>
        <NewProjectButton users={users} currentUserId={currentUserId} canCreate={canCreate} />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {projects.map((p, i) => {
        const completedTasks = p.tasks.filter((t) => t.status === 'done').length;
        const progress = p.tasks.length > 0 ? Math.round((completedTasks / p.tasks.length) * 100) : 0;
        const statusVariant = ({ active: 'green', planning: 'blue', on_hold: 'orange', completed: 'neutral', archived: 'neutral' } as const)[p.status];
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
          >
            <Link href={`/projects/${p.id}`} className="block group">
              <div className="bg-white rounded-xl border border-black/5 overflow-hidden shadow-fluent-2 hover:shadow-fluent-16 hover:-translate-y-0.5 transition-all duration-300">
                <div className="h-20 relative" style={{ background: `linear-gradient(135deg, ${p.color} 0%, ${p.color}dd 100%)` }}>
                  <div className="absolute inset-0 bg-mesh opacity-30" />
                  <ProjectCardMenu
                    project={p}
                    onEdit={() => setEditingProject(p)}
                  />
                  <div className="absolute -bottom-5 left-5 h-10 w-10 rounded-lg bg-white shadow-fluent-4 flex items-center justify-center text-lg font-bold" style={{ color: p.color }}>
                    {p.name[0]}
                  </div>
                </div>

                <div className="pt-7 px-5 pb-5">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-display font-semibold text-fluent-neutral-95 truncate">{p.name}</h3>
                    <Badge variant={statusVariant}>{statusLabel(p.status)}</Badge>
                  </div>
                  <p className="text-xs text-fluent-neutral-60 line-clamp-2 mb-4 min-h-[32px]">{p.description}</p>

                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-fluent-neutral-60">Πρόοδος</span>
                      <span className="font-semibold text-fluent-neutral-90">{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-fluent-neutral-8 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.33, 0, 0.67, 1] }}
                        className="h-full rounded-full"
                        style={{ background: p.color }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-fluent-neutral-60 mb-4">
                    <span className="flex items-center gap-1">
                      <CheckmarkCircle16Regular /> {completedTasks}/{p.tasks.length}
                    </span>
                    {p.dueDate && (
                      <span className="flex items-center gap-1">
                        <Calendar16Regular /> {formatDate(p.dueDate)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-black/5">
                    <AvatarStack users={p.members} max={4} size="xs" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>

    <AnimatePresence>
      {editingProject && (
        <ProjectModal title="Επεξεργασία έργου" onClose={() => setEditingProject(null)}>
          <ProjectForm
            users={users}
            initial={{
              name: editingProject.name,
              description: editingProject.description,
              color: editingProject.color,
              status: editingProject.status,
              dueDate: editingProject.dueDate,
              ownerId: editingProject.ownerId,
              memberIds: editingProject.memberIds,
            }}
            submitLabel="Αποθήκευση"
            onCancel={() => setEditingProject(null)}
            onSubmit={async (fd) => {
              const res = await updateProject(editingProject.id, fd);
              if (res?.ok) {
                setEditingProject(null);
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

function ProjectCardMenu({
  project,
  onEdit,
}: {
  project: ProjectWithRelations;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleToggle(e: React.MouseEvent) {
    stop(e);
    setOpen((v) => !v);
  }

  function handleOpen(e: React.MouseEvent) {
    stop(e);
    setOpen(false);
    router.push(`/projects/${project.id}`);
  }

  function handleEdit(e: React.MouseEvent) {
    stop(e);
    setOpen(false);
    onEdit();
  }

  function handleDelete(e: React.MouseEvent) {
    stop(e);
    if (!confirm(`Να διαγραφεί το έργο "${project.name}"; Αυτή η ενέργεια είναι μη αναστρέψιμη.`)) return;
    setOpen(false);
    startTransition(async () => {
      await deleteProject(project.id);
      router.refresh();
    });
  }

  return (
    <div ref={menuRef} className="absolute top-3 right-3 z-10">
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-8 w-8 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 flex items-center justify-center transition-opacity ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <MoreHorizontal20Regular />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1 w-48 rounded-lg bg-white shadow-fluent-16 border border-black/5 py-1 text-sm overflow-hidden"
          >
            <MenuItem onClick={handleOpen} icon={<Open20Regular />}>
              Άνοιγμα
            </MenuItem>
            {project.canEdit && (
              <>
                <MenuItem onClick={handleEdit} icon={<Edit20Regular />}>
                  Επεξεργασία
                </MenuItem>
                <div className="my-1 h-px bg-black/5" />
                <MenuItem onClick={handleDelete} icon={<Delete20Regular />} danger disabled={pending}>
                  Διαγραφή
                </MenuItem>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  children,
  danger,
  disabled,
}: {
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors disabled:opacity-50 ${
        danger
          ? 'text-fluent-danger hover:bg-fluent-danger/10'
          : 'text-fluent-neutral-90 hover:bg-fluent-neutral-6'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}
