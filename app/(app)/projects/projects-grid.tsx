'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MoreHorizontal20Regular,
  Calendar16Regular,
  CheckmarkCircle16Regular,
  Search20Regular,
  Open20Regular,
  Edit20Regular,
  Delete20Regular,
  Grid20Regular,
  TextBulletList20Regular,
} from '@fluentui/react-icons';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDate, statusLabel, cn } from '@/lib/utils';
import { NewProjectButton } from './new-project-button';
import { ProjectForm, ProjectModal, type UserOption } from './project-form';
import { updateProject, deleteProject, updateProjectStatus } from './actions';

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

type StatusBucket = 'active' | 'completed' | 'archived' | 'all';
type ViewMode = 'cards' | 'list';

const STATUS_VARIANT = {
  active: 'green',
  planning: 'blue',
  on_hold: 'orange',
  completed: 'neutral',
  archived: 'neutral',
} as const;

const ACTIVE_STATUSES: Status[] = ['planning', 'active', 'on_hold'];

function progressOf(p: ProjectWithRelations): { done: number; total: number; pct: number } {
  const done = p.tasks.filter((t) => t.status === 'done').length;
  const total = p.tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

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
  const [bucket, setBucket] = useState<StatusBucket>('active');
  const [view, setView] = useState<ViewMode>('cards');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c = { active: 0, completed: 0, archived: 0, all: projects.length };
    for (const p of projects) {
      if (ACTIVE_STATUSES.includes(p.status)) c.active++;
      else if (p.status === 'completed') c.completed++;
      else if (p.status === 'archived') c.archived++;
    }
    return c;
  }, [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (bucket === 'active' && !ACTIVE_STATUSES.includes(p.status)) return false;
      if (bucket === 'completed' && p.status !== 'completed') return false;
      if (bucket === 'archived' && p.status !== 'archived') return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [projects, bucket, query]);

  const tabs: Array<{ id: StatusBucket; label: string; count: number }> = [
    { id: 'active', label: 'Ενεργά', count: counts.active },
    { id: 'completed', label: 'Ολοκληρωμένα', count: counts.completed },
    { id: 'archived', label: 'Αρχειοθετημένα', count: counts.archived },
    { id: 'all', label: 'Όλα', count: counts.all },
  ];

  return (
    <>
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">Έργα</h1>
          <p className="text-fluent-neutral-60 mt-1">
            {visible.length} από {projects.length} {projects.length === 1 ? 'έργο' : 'έργα'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewProjectButton users={users} currentUserId={currentUserId} canCreate={canCreate} />
        </div>
      </div>

      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center bg-white rounded-md border border-fluent-neutral-20 p-1 shadow-fluent-2">
          {tabs.map((t) => {
            const active = bucket === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setBucket(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium h-8 px-3 rounded transition-colors',
                  active ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-70 hover:bg-fluent-neutral-4',
                )}
              >
                {t.label}
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] tabular-nums font-semibold',
                    active ? 'bg-fluent-blue-600 text-white' : 'bg-fluent-neutral-8 text-fluent-neutral-70',
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση έργου…"
            className="w-full h-9 pl-10 pr-3 rounded-md bg-white border border-fluent-neutral-20 text-sm placeholder:text-fluent-neutral-50 focus:bg-white focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>

        <div className="inline-flex items-center bg-white rounded-md border border-fluent-neutral-20 p-1 shadow-fluent-2">
          <button
            onClick={() => setView('cards')}
            aria-label="Προβολή καρτών"
            aria-pressed={view === 'cards'}
            className={cn(
              'h-8 w-8 rounded flex items-center justify-center transition-colors',
              view === 'cards' ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-70 hover:bg-fluent-neutral-4',
            )}
          >
            <Grid20Regular />
          </button>
          <button
            onClick={() => setView('list')}
            aria-label="Προβολή λίστας"
            aria-pressed={view === 'list'}
            className={cn(
              'h-8 w-8 rounded flex items-center justify-center transition-colors',
              view === 'list' ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-70 hover:bg-fluent-neutral-4',
            )}
          >
            <TextBulletList20Regular />
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-12 text-center">
          <p className="text-sm text-fluent-neutral-60">
            {query ? 'Κανένα έργο δεν ταιριάζει με την αναζήτηση.' : 'Δεν υπάρχουν έργα σε αυτή την κατηγορία.'}
          </p>
        </div>
      ) : view === 'cards' ? (
        <ProjectsCards projects={visible} onEdit={setEditingProject} />
      ) : (
        <ProjectsList projects={visible} onEdit={setEditingProject} />
      )}

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

function ProjectsCards({
  projects,
  onEdit,
}: {
  projects: ProjectWithRelations[];
  onEdit: (p: ProjectWithRelations) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {projects.map((p, i) => {
        const { done, total, pct } = progressOf(p);
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
          >
            <Link href={`/projects/${p.id}`} className="block group">
              <div className="bg-white rounded-xl border border-black/5 overflow-hidden shadow-fluent-2 hover:shadow-fluent-16 hover:-translate-y-0.5 transition-all duration-300">
                <div className="h-20 relative" style={{ background: `linear-gradient(135deg, ${p.color} 0%, ${p.color}dd 100%)` }}>
                  <div className="absolute inset-0 bg-mesh opacity-30" />
                  <ProjectCardMenu project={p} onEdit={() => onEdit(p)} />
                  <div className="absolute -bottom-5 left-5 h-10 w-10 rounded-lg bg-white shadow-fluent-4 flex items-center justify-center text-lg font-bold" style={{ color: p.color }}>
                    {p.name[0]}
                  </div>
                </div>

                <div className="pt-7 px-5 pb-5">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-display font-semibold text-fluent-neutral-95 truncate">{p.name}</h3>
                    <Badge variant={STATUS_VARIANT[p.status]}>{statusLabel(p.status)}</Badge>
                  </div>
                  <p className="text-xs text-fluent-neutral-60 line-clamp-2 mb-4 min-h-[32px]">{p.description}</p>

                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-fluent-neutral-60">Πρόοδος</span>
                      <span className="font-semibold text-fluent-neutral-90">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-fluent-neutral-8 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.33, 0, 0.67, 1] }}
                        className="h-full rounded-full"
                        style={{ background: p.color }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-fluent-neutral-60 mb-4">
                    <span className="flex items-center gap-1">
                      <CheckmarkCircle16Regular /> {done}/{total}
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
  );
}

function ProjectsList({
  projects,
  onEdit,
}: {
  projects: ProjectWithRelations[];
  onEdit: (p: ProjectWithRelations) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2">
      <div className="grid grid-cols-12 gap-3 px-4 h-10 items-center text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5 bg-fluent-neutral-4/40 rounded-t-xl">
        <div className="col-span-5 sm:col-span-4">Έργο</div>
        <div className="hidden sm:block sm:col-span-2">Κατάσταση</div>
        <div className="col-span-5 sm:col-span-3">Πρόοδος</div>
        <div className="hidden md:block md:col-span-2">Προθεσμία</div>
        <div className="hidden lg:block lg:col-span-1">Μέλη</div>
        <div className="col-span-2 sm:col-span-1 md:col-span-1 text-right pr-1">Ενέργειες</div>
      </div>
      <ul className="divide-y divide-black/5">
        {projects.map((p) => {
          const { done, total, pct } = progressOf(p);
          return (
            <li key={p.id} className="relative last:rounded-b-xl hover:bg-fluent-neutral-4/40 transition-colors">
              <Link
                href={`/projects/${p.id}`}
                className="grid grid-cols-12 gap-3 px-4 py-3 pr-14 items-center"
              >
                <div className="col-span-5 sm:col-span-4 flex items-center gap-3 min-w-0">
                  <div
                    className="h-9 w-9 rounded-md flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ background: p.color }}
                  >
                    {p.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-fluent-neutral-90 truncate">{p.name}</div>
                    {p.description && (
                      <div className="text-[11px] text-fluent-neutral-60 truncate">{p.description}</div>
                    )}
                  </div>
                </div>

                <div className="hidden sm:block sm:col-span-2">
                  <Badge variant={STATUS_VARIANT[p.status]}>{statusLabel(p.status)}</Badge>
                </div>

                <div className="col-span-5 sm:col-span-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-fluent-neutral-8 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                    </div>
                    <span className="text-[11px] font-semibold text-fluent-neutral-80 tabular-nums w-8 text-right">{pct}%</span>
                  </div>
                  <div className="text-[10px] text-fluent-neutral-60 mt-0.5 tabular-nums">
                    {done}/{total} εργασίες
                  </div>
                </div>

                <div className="hidden md:block md:col-span-2 text-[11px] text-fluent-neutral-70">
                  {p.dueDate ? (
                    <span className="inline-flex items-center gap-1">
                      <Calendar16Regular className="text-fluent-neutral-50" />
                      {formatDate(p.dueDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  ) : (
                    <span className="text-fluent-neutral-50">—</span>
                  )}
                </div>

                <div className="hidden lg:flex lg:col-span-1">
                  {p.members.length > 0 ? (
                    <AvatarStack users={p.members} max={3} size="xs" />
                  ) : (
                    <span className="text-[11px] text-fluent-neutral-50">—</span>
                  )}
                </div>
              </Link>

              <div className="absolute top-1/2 right-3 -translate-y-1/2">
                <ProjectCardMenu project={p} onEdit={() => onEdit(p)} compact />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProjectCardMenu({
  project,
  onEdit,
  compact,
}: {
  project: ProjectWithRelations;
  onEdit: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleToggle(e: React.MouseEvent) {
    stop(e);
    if (!open && compact && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopupPos({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
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

  function handleSetStatus(e: React.MouseEvent, status: Status) {
    stop(e);
    setOpen(false);
    if (status === project.status) return;
    startTransition(async () => {
      await updateProjectStatus(project.id, status);
      router.refresh();
    });
  }

  const menuContent = (
    <>
      <MenuItem onClick={handleOpen} icon={<Open20Regular />}>
        Άνοιγμα
      </MenuItem>
      {project.canEdit && (
        <>
          <MenuItem onClick={handleEdit} icon={<Edit20Regular />}>
            Επεξεργασία
          </MenuItem>
          <div className="my-1 h-px bg-black/5" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
            Κατάσταση
          </div>
          {(['planning', 'active', 'on_hold', 'completed', 'archived'] as const).map((s) => {
            const isCurrent = project.status === s;
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={(e) => handleSetStatus(e, s)}
                disabled={pending}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors disabled:opacity-50 text-fluent-neutral-90 hover:bg-fluent-neutral-6 ${isCurrent ? 'bg-fluent-blue-50' : ''}`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{
                    background: {
                      planning: '#0078D4',
                      active: '#107C10',
                      on_hold: '#D83B01',
                      completed: '#8A8A8A',
                      archived: '#5C5C5C',
                    }[s],
                  }}
                />
                <span className={`flex-1 truncate ${isCurrent ? 'font-semibold text-fluent-blue-700' : ''}`}>
                  {statusLabel(s)}
                </span>
                {isCurrent && <span className="text-fluent-blue-600 text-xs">✓</span>}
              </button>
            );
          })}
          <div className="my-1 h-px bg-black/5" />
          <MenuItem onClick={handleDelete} icon={<Delete20Regular />} danger disabled={pending}>
            Διαγραφή
          </MenuItem>
        </>
      )}
    </>
  );

  return (
    <div ref={menuRef} className={compact ? 'relative' : 'absolute top-3 right-3 z-10'}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          compact
            ? 'h-8 w-8 rounded-md text-fluent-neutral-70 hover:bg-fluent-neutral-8 flex items-center justify-center'
            : `h-8 w-8 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 flex items-center justify-center transition-opacity ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
        }
      >
        <MoreHorizontal20Regular />
      </button>
      {!compact && (
        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 mt-1 w-48 rounded-lg bg-white shadow-fluent-16 border border-black/5 py-1 text-sm overflow-hidden z-50"
            >
              {menuContent}
            </motion.div>
          )}
        </AnimatePresence>
      )}
      {compact && mounted && open && popupPos
        ? createPortal(
            <AnimatePresence>
              <motion.div
                ref={popupRef}
                role="menu"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="fixed w-52 rounded-lg bg-white shadow-fluent-16 border border-black/5 py-1 text-sm overflow-hidden z-[100]"
                style={{ top: popupPos.top, right: popupPos.right }}
              >
                {menuContent}
              </motion.div>
            </AnimatePresence>,
            document.body,
          )
        : null}
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
