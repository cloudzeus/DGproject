'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Add20Filled,
  Mail20Regular,
  BookAdd20Regular,
  ArrowImport20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { BoardTaskModal, type BoardProjectOption } from '@/app/(app)/board/board-task-modal';
import { NewProjectButton } from '@/app/(app)/projects/new-project-button';
import type { UserOption } from '@/app/(app)/projects/project-form';
import { EmailComposerModal, type EmailRecipientOption } from '@/components/email/email-composer-modal';
import { EmailImportModal } from '@/app/(app)/projects/[id]/email-import-modal';
import { sendProjectEmail } from '@/app/(app)/projects/[id]/email-actions';

export type QuickActionProject = BoardProjectOption & { projectCode: string | null };

type Props = {
  projects: QuickActionProject[];
  users: UserOption[];
  currentUserId: string;
  canCreateProject: boolean;
};

// Small inline dropdown used by the "Νέο email" / "Εισαγωγή από Outlook" actions to
// pick a project before opening their respective modal (both require a single
// project context and neither modal has a project selector of its own).
function ProjectPicker({
  label,
  icon,
  projects,
  onPick,
}: {
  label: string;
  icon: React.ReactNode;
  projects: QuickActionProject[];
  onPick: (project: QuickActionProject) => void;
}) {
  const [open, setOpen] = useState(false);

  if (projects.length === 0) return null;

  return (
    <div className="relative">
      <Button variant="secondary" size="md" icon={icon} onClick={() => setOpen((v) => !v)}>
        {label}
      </Button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 max-h-72 overflow-y-auto bg-white rounded-lg shadow-fluent-16 border border-black/5 py-1"
            >
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(p);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-fluent-neutral-90 hover:bg-fluent-neutral-6"
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function QuickActions({ projects, users, currentUserId, canCreateProject }: Props) {
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [emailProject, setEmailProject] = useState<QuickActionProject | null>(null);
  const [importProject, setImportProject] = useState<QuickActionProject | null>(null);

  const projectsWithCode = projects.filter((p): p is QuickActionProject & { projectCode: string } => !!p.projectCode);

  const emailRecipients: EmailRecipientOption[] = emailProject
    ? emailProject.members.map((m) => ({ id: m.id, name: m.name, email: m.email }))
    : [];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <Button
        variant="secondary"
        size="md"
        icon={<Add20Filled />}
        onClick={() => setTaskModalOpen(true)}
        disabled={projects.length === 0}
      >
        Νέα εργασία
      </Button>

      <NewProjectButton users={users} currentUserId={currentUserId} canCreate={canCreateProject} />

      <ProjectPicker
        label="Νέο email"
        icon={<Mail20Regular />}
        projects={projectsWithCode}
        onPick={setEmailProject}
      />

      <Link href="/knowledge/new">
        <Button variant="secondary" size="md" icon={<BookAdd20Regular />}>
          Νέο KB άρθρο
        </Button>
      </Link>

      <ProjectPicker
        label="Εισαγωγή από Outlook"
        icon={<ArrowImport20Regular />}
        projects={projectsWithCode}
        onPick={setImportProject}
      />

      {taskModalOpen && (
        <BoardTaskModal mode="create" projects={projects} onClose={() => setTaskModalOpen(false)} />
      )}

      {emailProject && emailProject.projectCode && (
        <EmailComposerModal
          open
          onClose={() => setEmailProject(null)}
          context={{ projectId: emailProject.id, projectCode: emailProject.projectCode }}
          recipients={emailRecipients}
          onSend={sendProjectEmail}
        />
      )}

      {importProject && importProject.projectCode && (
        <EmailImportModal
          open
          onClose={() => setImportProject(null)}
          projectId={importProject.id}
          projectCode={importProject.projectCode}
          openTasks={[]}
        />
      )}
    </div>
  );
}
