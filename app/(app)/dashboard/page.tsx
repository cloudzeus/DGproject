'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  TaskListLtr20Regular, CheckmarkCircle20Regular, Clock20Regular,
  People20Regular, ArrowRight16Regular, Flag16Filled,
  Circle16Regular, CheckmarkCircle16Filled,
} from '@fluentui/react-icons';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  currentUser, mockTasks, mockActivities, mockUsers, mockProjects,
  getAllProjectsWithStats,
} from '@/lib/mock-data';
import { cn, formatRelative, priorityColor, statusLabel } from '@/lib/utils';

export default function DashboardPage() {
  const myTasks = mockTasks.filter(t => t.assigneeIds.includes(currentUser.id) && t.status !== 'done');
  const dueSoon = myTasks.filter(t => t.dueDate && (t.dueDate.getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000).slice(0, 5);
  const activeProjects = getAllProjectsWithStats().filter(p => p.status === 'active');

  const stats = [
    { label: 'My Tasks', value: myTasks.length, Icon: TaskListLtr20Regular, tint: 'bg-fluent-blue-50 text-fluent-blue-600', trend: '+2 this week' },
    { label: 'Completed', value: mockTasks.filter(t => t.status === 'done' && t.assigneeIds.includes(currentUser.id)).length, Icon: CheckmarkCircle20Regular, tint: 'bg-green-50 text-fluent-accent-green', trend: '+5 this week' },
    { label: 'Due Soon',  value: dueSoon.length, Icon: Clock20Regular, tint: 'bg-orange-50 text-fluent-accent-orange', trend: 'Next 7 days' },
    { label: 'Team',      value: mockUsers.length, Icon: People20Regular, tint: 'bg-purple-50 text-fluent-accent-purple', trend: '4 online now' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

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
          {greeting}, {currentUser.name.split(' ')[0]} <span className="inline-block animate-pulse">👋</span>
        </h1>
        <p className="text-fluent-neutral-60 mt-1.5">
          You have <span className="font-semibold text-fluent-neutral-90">{myTasks.length} open tasks</span> and{' '}
          <span className="font-semibold text-fluent-neutral-90">{dueSoon.length} due this week</span>.
        </p>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.06 }}
            className="bg-white rounded-xl border border-black/5 p-5 shadow-fluent-2 hover:shadow-fluent-8 transition-all duration-300 reveal"
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
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My tasks (2 cols) */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25 }}
          className="lg:col-span-2 bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-black/5">
            <div>
              <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">Due this week</h2>
              <p className="text-xs text-fluent-neutral-60 mt-0.5">Your upcoming deadlines</p>
            </div>
            <Link href="/board">
              <Button variant="ghost" size="sm" icon={<ArrowRight16Regular />}>View all</Button>
            </Link>
          </div>
          <div className="divide-y divide-black/5">
            {dueSoon.length === 0 && (
              <div className="p-10 text-center text-sm text-fluent-neutral-60">Nothing due this week. Nice.</div>
            )}
            {dueSoon.map((t) => {
              const project = mockProjects.find(p => p.id === t.projectId)!;
              const assignees = mockUsers.filter(u => t.assigneeIds.includes(u.id));
              return (
                <div key={t.id} className="p-4 hover:bg-fluent-neutral-4 transition-colors group flex items-center gap-4">
                  <button className="text-fluent-neutral-30 hover:text-fluent-accent-green transition-colors">
                    <Circle16Regular className="h-5 w-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: project.color }} />
                      <span className="text-[11px] font-medium text-fluent-neutral-60 uppercase tracking-wide">{project.name}</span>
                    </div>
                    <p className="text-sm font-medium text-fluent-neutral-90 truncate">{t.title}</p>
                  </div>
                  <Badge variant={t.priority === 'high' ? 'orange' : t.priority === 'urgent' ? 'red' : 'neutral'}>
                    <Flag16Filled className="h-3 w-3" /> {t.priority}
                  </Badge>
                  <span className="text-xs text-fluent-neutral-60 w-20 text-right">{formatRelative(t.dueDate)}</span>
                  <AvatarStack users={assignees} max={2} size="xs" />
                </div>
              );
            })}
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
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">Activity</h2>
            <p className="text-xs text-fluent-neutral-60 mt-0.5">Recent team updates</p>
          </div>
          <div className="p-4 space-y-1 max-h-96 overflow-y-auto">
            {mockActivities.map((a) => {
              const actor = mockUsers.find(u => u.id === a.actorId)!;
              const task = mockTasks.find(t => t.id === a.taskId);
              const verb = {
                created: 'created', updated: 'updated', completed: 'completed',
                commented: 'commented on', assigned: 'was assigned to', moved: 'moved',
              }[a.action];
              return (
                <div key={a.id} className="flex gap-3 p-2 rounded-md hover:bg-fluent-neutral-4 transition-colors">
                  <Avatar user={actor} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-fluent-neutral-80 leading-snug">
                      <span className="font-semibold text-fluent-neutral-90">{actor.name.split(' ')[0]}</span>{' '}
                      {verb}{' '}
                      <span className="font-medium text-fluent-neutral-90">{task?.title ?? 'a task'}</span>
                    </p>
                    <p className="text-[11px] text-fluent-neutral-50 mt-0.5">{formatRelative(a.createdAt)}</p>
                  </div>
                </div>
              );
            })}
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
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">Active projects</h2>
            <p className="text-xs text-fluent-neutral-60 mt-0.5">Projects you're working on</p>
          </div>
          <Link href="/projects">
            <Button variant="ghost" size="sm" icon={<ArrowRight16Regular />}>View all</Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeProjects.slice(0, 3).map((p) => {
            const members = mockUsers.filter(u => p.memberIds.includes(u.id));
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
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
                  <h3 className="font-display font-semibold text-fluent-neutral-95 mb-1">{p.name}</h3>
                  <p className="text-xs text-fluent-neutral-60 line-clamp-2 mb-4">{p.description}</p>

                  {/* progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-fluent-neutral-60">Progress</span>
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
                    <AvatarStack users={members} max={3} size="xs" />
                    <span className="text-[11px] text-fluent-neutral-60">
                      {p.completedTaskCount}/{p.taskCount} tasks
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}
