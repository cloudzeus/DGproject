'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft20Regular, Share20Regular, MoreHorizontal20Regular,
  Board20Regular, List20Regular, Calendar20Regular, DataBarVertical20Regular,
  ArrowDownload20Regular, Open20Regular, CheckmarkCircle20Filled,
  DocumentMultiple20Regular, Mail20Regular,
} from '@fluentui/react-icons';
import { ReportModal } from './report-modal';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDate, statusLabel } from '@/lib/utils';
import { ListView, BoardView, TimelineView, ReportsView, computeStats, type TaskRow } from './task-views';
import type { TaskAssigneeOption } from './task-form';
import type { ProjectMemberOption } from './task-questions-panel';
import { ProjectAttachments, type ProjectAttachmentInfo } from './project-attachments';
import { ProjectFiles, type ProjectFileItem } from './project-files';

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
  questionMembers: ProjectMemberOption[];
  currentUserId: string;
  isPrivileged: boolean;
  canEdit: boolean;
  projectAttachments: ProjectAttachmentInfo[];
  aggregatedFiles: ProjectFileItem[];
};

type Tab = 'board' | 'list' | 'timeline' | 'files' | 'reports';

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-start gap-2 px-3 py-2 text-left text-fluent-neutral-90 hover:bg-fluent-neutral-6 transition-colors"
    >
      <span className="shrink-0 text-fluent-neutral-70 mt-0.5">{icon}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </button>
  );
}

const TABS: { id: Tab; label: string; Icon: typeof Board20Regular }[] = [
  { id: 'board', label: 'Board', Icon: Board20Regular },
  { id: 'list', label: 'Λίστα', Icon: List20Regular },
  { id: 'timeline', label: 'Χρονοδιάγραμμα', Icon: Calendar20Regular },
  { id: 'files', label: 'Αρχεία', Icon: DocumentMultiple20Regular },
  { id: 'reports', label: 'Αναφορές', Icon: DataBarVertical20Regular },
];

export function ProjectDetail({
  project,
  projectMembers,
  questionMembers,
  currentUserId,
  isPrivileged,
  canEdit,
  projectAttachments,
  aggregatedFiles,
}: ProjectDetailProps) {
  const [tab, setTab] = useState<Tab>('board');
  const [shareCopied, setShareCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const stats = computeStats(project.tasks);
  const statusVariant = ({ active: 'green', planning: 'blue', on_hold: 'orange', completed: 'neutral', archived: 'neutral' } as const)[project.status];

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function handleShare() {
    const url = `${window.location.origin}/projects/${project.id}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: project.name, url });
        return;
      }
    } catch {
      // user cancelled share sheet, fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2200);
    } catch {
      window.prompt('Αντιγράψτε τον σύνδεσμο:', url);
    }
  }

  function handleExportExcel() {
    setMenuOpen(false);
    window.location.href = `/api/projects/${project.id}/export`;
  }

  function handleOpenInNewTab() {
    setMenuOpen(false);
    window.open(`/projects/${project.id}`, '_blank');
  }

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
            <div className="flex items-center gap-2 shrink-0 relative" ref={menuRef}>
              <button
                type="button"
                onClick={handleShare}
                className="h-9 px-4 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 flex items-center gap-1.5 text-sm font-semibold transition-colors"
                aria-label="Κοινοποίηση"
              >
                {shareCopied ? (
                  <>
                    <CheckmarkCircle20Filled className="h-4 w-4" /> Αντιγράφηκε!
                  </>
                ) : (
                  <>
                    <Share20Regular className="h-4 w-4" /> Κοινοποίηση
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="h-9 w-9 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 flex items-center justify-center"
              >
                <MoreHorizontal20Regular />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-2 w-64 rounded-lg bg-white shadow-fluent-16 border border-black/5 py-1 text-sm z-20 overflow-hidden"
                  >
                    {canEdit && (
                      <MenuItem
                        icon={<Mail20Regular />}
                        onClick={() => {
                          setMenuOpen(false);
                          setReportOpen(true);
                        }}
                      >
                        <div>
                          <div className="font-medium">Αποστολή αναφοράς πελάτη</div>
                          <div className="text-[11px] text-fluent-neutral-60">
                            Στείλε branded HTML αναφορά μέσω email
                          </div>
                        </div>
                      </MenuItem>
                    )}
                    <MenuItem icon={<ArrowDownload20Regular />} onClick={handleExportExcel}>
                      <div>
                        <div className="font-medium">Λήψη αναφοράς Excel</div>
                        <div className="text-[11px] text-fluent-neutral-60">
                          Πλήρη στοιχεία έργου, εργασιών και μελών
                        </div>
                      </div>
                    </MenuItem>
                    <MenuItem icon={<Share20Regular />} onClick={() => { setMenuOpen(false); handleShare(); }}>
                      Αντιγραφή συνδέσμου
                    </MenuItem>
                    <MenuItem icon={<Open20Regular />} onClick={handleOpenInNewTab}>
                      Άνοιγμα σε νέα καρτέλα
                    </MenuItem>
                  </motion.div>
                )}
              </AnimatePresence>
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
            const count = t.id === 'files' ? aggregatedFiles.length : null;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 h-11 text-sm font-medium transition-colors border-b-2 -mb-px ${active ? 'text-fluent-blue-700 border-fluent-blue-500' : 'text-fluent-neutral-70 border-transparent hover:text-fluent-neutral-90'}`}
              >
                <t.Icon className="h-4 w-4" /> {t.label}
                {count !== null && count > 0 && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] tabular-nums font-semibold ${
                      active ? 'bg-fluent-blue-600 text-white' : 'bg-fluent-neutral-8 text-fluent-neutral-70'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        {tab === 'board' && <BoardView projectId={project.id} tasks={project.tasks} members={projectMembers} canEdit={canEdit} questionMembers={questionMembers} currentUserId={currentUserId} isPrivileged={isPrivileged} />}
        {tab === 'list' && <ListView projectId={project.id} tasks={project.tasks} members={projectMembers} canEdit={canEdit} questionMembers={questionMembers} currentUserId={currentUserId} isPrivileged={isPrivileged} />}
        {tab === 'timeline' && <TimelineView projectId={project.id} projectName={project.name} projectColor={project.color} tasks={project.tasks} members={projectMembers} canEdit={canEdit} questionMembers={questionMembers} currentUserId={currentUserId} isPrivileged={isPrivileged} />}
        {tab === 'files' && (
          <div className="space-y-4">
            <ProjectAttachments
              projectId={project.id}
              attachments={projectAttachments}
              canEdit={canEdit}
            />
            <ProjectFiles files={aggregatedFiles} />
          </div>
        )}
        {tab === 'reports' && <ReportsView tasks={project.tasks} />}
      </div>

      <AnimatePresence>
        {reportOpen && (
          <ReportModal
            projectId={project.id}
            projectName={project.name}
            onClose={() => setReportOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
