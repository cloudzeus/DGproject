'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  greeting: string;
  firstName: string;
  dateLabel: string;
  main: ReactNode;
  aside: ReactNode;
}

export function DashboardShell({ greeting, firstName, dateLabel, main, aside }: Props) {
  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 flex flex-col gap-6">{main}</div>
        {aside && <div className="flex flex-col gap-6">{aside}</div>}
      </div>
    </div>
  );
}
