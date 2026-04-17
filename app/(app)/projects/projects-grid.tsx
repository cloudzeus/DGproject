'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  MoreHorizontal20Regular,
  Calendar16Regular,
  CheckmarkCircle16Regular,
  Filter20Regular,
} from '@fluentui/react-icons';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, statusLabel } from '@/lib/utils';
import { NewProjectButton } from './new-project-button';
import type { UserOption } from './project-form';

type ProjectWithRelations = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: 'active' | 'planning' | 'on_hold' | 'completed' | 'archived';
  dueDate: Date | null;
  members: Array<{ name: string; avatarUrl?: string }>;
  tasks: Array<{ id: string; status: string }>;
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
                  <button className="absolute top-3 right-3 h-8 w-8 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                    <MoreHorizontal20Regular />
                  </button>
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
    </>
  );
}
