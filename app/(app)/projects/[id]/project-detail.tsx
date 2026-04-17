'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft20Regular, Share20Regular, Star20Regular, MoreHorizontal20Regular,
  Board20Regular, List20Regular, Calendar20Regular, DataBarVertical20Regular,
} from '@fluentui/react-icons';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDate, statusLabel } from '@/lib/utils';
import { ListView, BoardView, TimelineView, ReportsView, computeStats, type TaskRow } from './task-views';
import type { TaskAssigneeOption } from './task-form';

type AvatarUser = { name: string; avatarUrl?: string };

type ProjectDetailProps = {
  project: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    status: 'active' | 'planning' | 'on_hold' | 'completed' | 'archived';
    dueDate: Date | null;
    members: AvatarUser[];
    tasks: TaskRow[];
  };
  projectMembers: TaskAssigneeOption[];
  canEdit: boolean;
};

type Tab = 'board' | 'list' | 'timeline' | 'reports';

const TABS: { id: Tab; label: string; Icon: typeof Board20Regular }[] = [
  { id: 'board', label: 'Board', Icon: Board20Regular },
  { id: 'list', label: 'Λίστα', Icon: List20Regular },
  { id: 'timeline', label: 'Χρονοδιάγραμμα', Icon: Calendar20Regular },
  { id: 'reports', label: 'Αναφορές', Icon: DataBarVertical20Regular },
];

export function ProjectDetail({ project, projectMembers, canEdit }: ProjectDetailProps) {
  const [tab, setTab] = useState<Tab>('board');
  const stats = computeStats(project.tasks);
  const statusVariant = ({ active: 'green', planning: 'blue', on_hold: 'orange', completed: 'neutral', archived: 'neutral' } as const)[project.status];

  return (
    <div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative"
        style={{ background: `linear-gradient(135deg, ${project.color} 0%, ${project.color}cc 100%)` }}
      >
        <div className="absolute inset-0 bg-mesh opacity-40" />
        <div className="relative max-w-[1600px] mx-auto px-6 lg:px-8 pt-6 pb-8">
          <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white mb-5">
            <ArrowLeft20Regular className="h-4 w-4" /> Πίσω στα έργα
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="h-16 w-16 rounded-xl bg-white shadow-fluent-8 flex items-center justify-center text-2xl font-bold shrink-0" style={{ color: project.color }}>
                {project.name[0]}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={statusVariant}>{statusLabel(project.status)}</Badge>
                  {project.dueDate && (
                    <span className="text-white/80 text-xs">Λήξη {formatDate(project.dueDate, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  )}
                </div>
                <h1 className="font-display text-3xl font-semibold text-white tracking-tight">{project.name}</h1>
                <p className="text-white/80 text-sm mt-1 max-w-2xl">{project.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button className="h-9 w-9 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 flex items-center justify-center">
                <Star20Regular />
              </button>
              <button className="h-9 px-4 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 flex items-center gap-1.5 text-sm font-semibold">
                <Share20Regular className="h-4 w-4" /> Κοινοποίηση
              </button>
              <button className="h-9 w-9 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 flex items-center justify-center">
                <MoreHorizontal20Regular />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-8 mt-6 text-white">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/70">Πρόοδος</div>
              <div className="text-2xl font-semibold font-display">{stats.completionPct}%</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-white/70">Εργασίες</div>
              <div className="text-2xl font-semibold font-display tabular-nums">{stats.done}/{stats.total}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-white/70">Εκτιμ. ώρες</div>
              <div className="text-2xl font-semibold font-display tabular-nums">{stats.totalHours}h</div>
              <div className="text-[11px] text-white/70 mt-0.5">απομένουν {stats.remainingHours}h</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-white/70">Ομάδα</div>
              <AvatarStack users={project.members} max={4} size="sm" />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="bg-white border-b border-black/5 px-6 lg:px-8">
        <div className="max-w-[1600px] mx-auto flex gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 h-11 text-sm font-medium transition-colors border-b-2 -mb-px ${active ? 'text-fluent-blue-700 border-fluent-blue-500' : 'text-fluent-neutral-70 border-transparent hover:text-fluent-neutral-90'}`}
              >
                <t.Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        {tab === 'board' && <BoardView projectId={project.id} tasks={project.tasks} members={projectMembers} canEdit={canEdit} />}
        {tab === 'list' && <ListView projectId={project.id} tasks={project.tasks} members={projectMembers} canEdit={canEdit} />}
        {tab === 'timeline' && <TimelineView projectId={project.id} projectName={project.name} projectColor={project.color} tasks={project.tasks} members={projectMembers} canEdit={canEdit} />}
        {tab === 'reports' && <ReportsView tasks={project.tasks} />}
      </div>
    </div>
  );
}
