'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CommandPalette } from '@/components/command-palette';
import { QuickActions, type QuickActionProject } from './quick-actions';
import type { UserOption } from '@/app/(app)/projects/project-form';

interface Props {
  greeting: string;
  firstName: string;
  dateLabel: string;
  main: ReactNode;
  aside: ReactNode;
  quickActionsProps: {
    projects: QuickActionProject[];
    users: UserOption[];
    currentUserId: string;
    canCreateProject: boolean;
  };
}

export function DashboardShell({ greeting, firstName, dateLabel, main, aside, quickActionsProps }: Props) {
  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Dashboard-scoped for now — the spec's ambition is a global ⌘K available
          from anywhere in the app (mounted in the layout that hosts the
          sidebar/topbar). Mounting it here keeps the shortcut working while on
          the dashboard without touching the shared app shell in this task. */}
      <CommandPalette />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">
          {greeting}, {firstName} <span className="inline-block animate-pulse">👋</span>
        </h1>
        <p className="text-fluent-neutral-60 mt-1.5 capitalize">{dateLabel}</p>
      </motion.div>

      <QuickActions {...quickActionsProps} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 flex flex-col gap-6">{main}</div>
        {aside && <div className="flex flex-col gap-6">{aside}</div>}
      </div>
    </div>
  );
}
