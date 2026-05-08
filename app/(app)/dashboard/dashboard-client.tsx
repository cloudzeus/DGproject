'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  TaskListLtr20Regular,
  CheckmarkCircle20Regular,
  Clock20Regular,
  People20Regular,
  ArrowRight16Regular,
  Flag16Filled,
  Circle16Regular,
  ReOrderDotsVertical20Regular,
} from '@fluentui/react-icons';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, formatRelative, statusLabel } from '@/lib/utils';
import { reorderProjects } from '@/app/(app)/projects/actions';

type UserLite = { id: string; name: string; avatarUrl?: string };

export type DashboardTask = {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: Date | null;
  project: { id: string; name: string; color: string };
  assignees: UserLite[];
};

export type DashboardActivity = {
  id: string;
  action: 'created' | 'updated' | 'completed' | 'commented' | 'assigned' | 'moved';
  createdAt: Date;
  actor: UserLite;
  taskTitle: string | null;
};

export type DashboardProject = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
  progress: number;
  taskCount: number;
  completedTaskCount: number;
  members: UserLite[];
};

interface Props {
  greeting: string;
  firstName: string;
  stats: {
    myTasks: number;
    completed: number;
    dueSoon: number;
    team: number;
  };
  dueSoon: DashboardTask[];
  activities: DashboardActivity[];
  activeProjects: DashboardProject[];
  canReorder?: boolean;
}

const VERB: Record<DashboardActivity['action'], string> = {
  created: 'created',
  updated: 'updated',
  completed: 'completed',
  commented: 'commented on',
  assigned: 'was assigned to',
  moved: 'moved',
};

export function DashboardClient({
  greeting,
  firstName,
  stats,
  dueSoon,
  activities,
  activeProjects,
  canReorder = true,
}: Props) {
  const router = useRouter();
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const [, startReorder] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const orderedActiveProjects = useMemo(() => {
    if (!orderOverride) return activeProjects;
    const map = new Map(activeProjects.map((p) => [p.id, p]));
    const out: DashboardProject[] = [];
    const seen = new Set<string>();
    for (const id of orderOverride) {
      const p = map.get(id);
      if (p) {
        out.push(p);
        seen.add(id);
      }
    }
    for (const p of activeProjects) if (!seen.has(p.id)) out.push(p);
    return out;
  }, [activeProjects, orderOverride]);
  const visibleIds = useMemo(() => orderedActiveProjects.map((p) => p.id), [orderedActiveProjects]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = visibleIds.indexOf(String(active.id));
    const toIdx = visibleIds.indexOf(String(over.id));
    if (fromIdx === -1 || toIdx === -1) return;
    const next = arrayMove(visibleIds, fromIdx, toIdx);
    setOrderOverride(next);
    startReorder(async () => {
      const res = await reorderProjects(next);
      if (!res?.ok) setOrderOverride(null);
      router.refresh();
    });
  }
  const statCards = [
    {
      label: 'Οι εργασίες μου',
      value: stats.myTasks,
      Icon: TaskListLtr20Regular,
      tint: 'bg-fluent-blue-50 text-fluent-blue-600',
      trend: 'Ανοιχτές',
      href: '/board',
    },
    {
      label: 'Ολοκληρωμένες',
      value: stats.completed,
      Icon: CheckmarkCircle20Regular,
      tint: 'bg-green-50 text-fluent-accent-green',
      trend: 'Όλες',
      href: '/board',
    },
    {
      label: 'Λήγουν σύντομα',
      value: stats.dueSoon,
      Icon: Clock20Regular,
      tint: 'bg-orange-50 text-fluent-accent-orange',
      trend: 'Επόμενες 7 μέρες',
      href: '/board',
    },
    {
      label: 'Ομάδα',
      value: stats.team,
      Icon: People20Regular,
      tint: 'bg-purple-50 text-fluent-accent-purple',
      trend: 'Σύνολο μελών',
      href: '/team',
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Hero greeting */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">
          {greeting}, {firstName} <span className="inline-block animate-pulse">👋</span>
        </h1>
        <p className="text-fluent-neutral-60 mt-1.5">
          Έχεις{' '}
          <span className="font-semibold text-fluent-neutral-90">{stats.myTasks} ανοιχτές εργασίες</span>{' '}
          και{' '}
          <span className="font-semibold text-fluent-neutral-90">
            {stats.dueSoon} με προθεσμία αυτή την εβδομάδα
          </span>
          .
        </p>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.06 }}
          >
            <Link
              href={s.href}
              className="block bg-white rounded-xl border border-black/5 p-5 shadow-fluent-2 hover:shadow-fluent-8 hover:border-fluent-blue-200 transition-all duration-300 reveal h-full"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', s.tint)}>
                  <s.Icon />
                </div>
              </div>
              <div className="text-3xl font-semibold font-display tracking-tight text-fluent-neutral-95">
                {s.value}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-fluent-neutral-60">{s.label}</span>
                <span className="text-[11px] text-fluent-neutral-50">{s.trend}</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Due this week */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25 }}
          className="lg:col-span-2 bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-black/5">
            <div>
              <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">
                Προθεσμίες εβδομάδας
              </h2>
              <p className="text-xs text-fluent-neutral-60 mt-0.5">Οι επερχόμενες λήξεις σου</p>
            </div>
            <Link
              href="/board"
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-semibold text-fluent-neutral-80 hover:bg-fluent-neutral-8 transition-colors"
            >
              Προβολή όλων
              <ArrowRight16Regular />
            </Link>
          </div>
          <div className="divide-y divide-black/5">
            {dueSoon.length === 0 && (
              <div className="p-10 text-center text-sm text-fluent-neutral-60">
                Καμία προθεσμία αυτή την εβδομάδα.
              </div>
            )}
            {dueSoon.map((t) => (
              <div
                key={t.id}
                className="p-4 hover:bg-fluent-neutral-4 transition-colors group flex items-center gap-4"
              >
                <button className="text-fluent-neutral-30 hover:text-fluent-accent-green transition-colors">
                  <Circle16Regular className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: t.project.color }}
                    />
                    <span className="text-[11px] font-medium text-fluent-neutral-60 uppercase tracking-wide">
                      {t.project.name}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-fluent-neutral-90 truncate">{t.title}</p>
                </div>
                <Badge
                  variant={
                    t.priority === 'urgent'
                      ? 'red'
                      : t.priority === 'high'
                        ? 'orange'
                        : 'neutral'
                  }
                >
                  <Flag16Filled className="h-3 w-3" /> {t.priority}
                </Badge>
                <span className="text-xs text-fluent-neutral-60 w-20 text-right">
                  {formatRelative(t.dueDate ?? undefined)}
                </span>
                <AvatarStack users={t.assignees} max={2} size="xs" />
              </div>
            ))}
          </div>
        </motion.section>

        {/* Activity feed */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
          className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
        >
          <div className="p-5 border-b border-black/5">
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">
              Δραστηριότητα
            </h2>
            <p className="text-xs text-fluent-neutral-60 mt-0.5">Πρόσφατες ενέργειες ομάδας</p>
          </div>
          <div className="p-4 space-y-1 max-h-96 overflow-y-auto">
            {activities.length === 0 && (
              <div className="p-6 text-center text-sm text-fluent-neutral-60">
                Δεν υπάρχουν ακόμη ενέργειες.
              </div>
            )}
            {activities.map((a) => (
              <div
                key={a.id}
                className="flex gap-3 p-2 rounded-md hover:bg-fluent-neutral-4 transition-colors"
              >
                <Avatar user={a.actor} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-fluent-neutral-80 leading-snug">
                    <span className="font-semibold text-fluent-neutral-90">
                      {a.actor.name.split(' ')[0]}
                    </span>{' '}
                    {VERB[a.action]}{' '}
                    <span className="font-medium text-fluent-neutral-90">
                      {a.taskTitle ?? 'a task'}
                    </span>
                  </p>
                  <p className="text-[11px] text-fluent-neutral-50 mt-0.5">
                    {formatRelative(a.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      </div>

      {/* Active projects */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.35 }}
        className="mt-8"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">
              Ενεργά έργα
            </h2>
            <p className="text-xs text-fluent-neutral-60 mt-0.5">Έργα στα οποία εργάζεσαι</p>
          </div>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-semibold text-fluent-neutral-80 hover:bg-fluent-neutral-8 transition-colors"
          >
            Προβολή όλων
            <ArrowRight16Regular />
          </Link>
        </div>
        {orderedActiveProjects.length === 0 ? (
          <div className="bg-white rounded-xl border border-black/5 p-10 text-center text-sm text-fluent-neutral-60">
            Δεν υπάρχουν ενεργά έργα.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {orderedActiveProjects.map((p) => (
                  <SortableDashboardCard key={p.id} project={p} canReorder={canReorder} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </motion.section>
    </div>
  );
}

function SortableDashboardCard({
  project: p,
  canReorder,
}: {
  project: DashboardProject;
  canReorder: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: p.id, disabled: !canReorder });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} className="relative group/card">
      {canReorder && (
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          type="button"
          aria-label="Σύρε για αλλαγή σειράς"
          title="Σύρε για αλλαγή σειράς"
          className="absolute top-2 right-2 z-20 h-7 w-7 rounded-md bg-white/85 backdrop-blur shadow-fluent-2 text-fluent-neutral-70 hover:bg-white hover:text-fluent-neutral-90 cursor-grab active:cursor-grabbing flex items-center justify-center opacity-0 group-hover/card:opacity-100 focus:opacity-100 transition-opacity"
        >
          <ReOrderDotsVertical20Regular className="h-4 w-4" />
        </button>
      )}
      <Link href={`/projects/${p.id}`}>
        <div className="bg-white rounded-xl border border-black/5 p-5 shadow-fluent-2 hover:shadow-fluent-8 transition-all duration-300 reveal h-full">
          <div className="flex items-start justify-between mb-4">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ background: p.color }}
            >
              {p.name[0]}
            </div>
            <Badge variant="green">{statusLabel(p.status)}</Badge>
          </div>
          <h3 className="font-display font-semibold text-fluent-neutral-95 mb-1">
            {p.name}
          </h3>
          <p className="text-xs text-fluent-neutral-60 line-clamp-2 mb-4">
            {p.description ?? ''}
          </p>

          <div className="mb-4">
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="text-fluent-neutral-60">Πρόοδος</span>
              <span className="font-semibold text-fluent-neutral-90">{p.progress}%</span>
            </div>
            <div className="h-1.5 bg-fluent-neutral-8 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${p.progress}%` }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.33, 0, 0.67, 1] }}
                className="h-full rounded-full"
                style={{ background: p.color }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <AvatarStack users={p.members} max={3} size="xs" />
            <span className="text-[11px] text-fluent-neutral-60">
              {p.completedTaskCount}/{p.taskCount} εργασίες
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
