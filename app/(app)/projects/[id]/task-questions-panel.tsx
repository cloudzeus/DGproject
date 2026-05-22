'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChatBubblesQuestion20Regular,
  Send20Regular,
  ArrowReply20Regular,
  Attach20Regular,
  Delete20Regular,
  Dismiss20Regular,
  DocumentPdf20Regular,
  Image20Regular,
  Document20Regular,
  CheckmarkCircle20Filled,
  ClockArrowDownload20Regular,
  Person20Regular,
  ChevronDown20Regular,
  History20Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { SendEmailButton } from '@/components/email/send-email-button';
import { Button } from '@/components/ui/button';
import {
  askTaskQuestion,
  answerTaskQuestion,
  deleteTaskQuestion,
  deleteQuestionAttachment,
} from './question-actions';
import { uploadFileWithProgress, type UploadProgress } from '@/lib/upload-client';

export type QuestionAttachmentInfo = {
  id: string;
  kind: 'question' | 'answer';
  uploadedById: string;
  name: string;
  title: string | null;
  size: number;
  mimeType: string;
  url: string;
};

export type TaskQuestionInfo = {
  id: string;
  parentId: string | null;
  question: string;
  answer: string | null;
  answeredAt: Date | null;
  createdAt: Date;
  askedBy: { id: string; name: string; email: string; avatarUrl?: string };
  askedTo: { id: string; name: string; email: string; avatarUrl?: string };
  attachments: QuestionAttachmentInfo[];
};

export type ProjectMemberOption = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

type Props = {
  projectId: string;
  projectCode?: string | null;
  taskId: string;
  taskTitle?: string;
  currentUserId: string;
  isPrivileged: boolean;
  members: ProjectMemberOption[];
  questions: TaskQuestionInfo[];
};

export function TaskQuestionsPanel({
  projectId,
  projectCode,
  taskId,
  taskTitle,
  currentUserId,
  isPrivileged,
  members,
  questions,
}: Props) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, startTransition] = useTransition();

  const askable = members.filter((m) => m.id !== currentUserId);

  const refresh = () => startTransition(() => router.refresh());

  // Build thread map: parentId -> children, in chronological order.
  const childrenByParent = new Map<string, TaskQuestionInfo[]>();
  for (const q of questions) {
    const key = q.parentId ?? '__root__';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(q);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  const roots = [...(childrenByParent.get('__root__') ?? [])].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  function threadHasPending(rootId: string): boolean {
    const stack: TaskQuestionInfo[] = (childrenByParent.get(rootId) ?? []).slice();
    while (stack.length) {
      const n = stack.pop()!;
      if (!n.answer) return true;
      for (const c of childrenByParent.get(n.id) ?? []) stack.push(c);
    }
    return false;
  }

  const pendingRoots = roots.filter((r) => !r.answer || threadHasPending(r.id));
  const answeredRoots = roots.filter((r) => !(pendingRoots.includes(r)));
  const pendingCount = pendingRoots.length;
  const answeredCount = answeredRoots.length;

  return (
    <div className="pt-4 mt-4 border-t border-black/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-fluent-neutral-90 inline-flex items-center gap-2">
          <ChatBubblesQuestion20Regular className="h-5 w-5 text-fluent-blue-600" />
          Ερωτήσεις
          <span className="text-xs font-medium text-fluent-neutral-60 px-1.5 py-0.5 rounded-full bg-fluent-neutral-8">
            {questions.length}
          </span>
          {pendingCount > 0 && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-fluent-accent-orange/10 text-fluent-accent-orange">
              {pendingCount} εκκρεμ{pendingCount === 1 ? 'εί' : 'ούν'}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {projectCode && askable.length > 0 && (
            <SendEmailButton
              projectId={projectId}
              projectCode={projectCode}
              taskId={taskId}
              defaultSubject={taskTitle ? `[${taskTitle}]` : undefined}
              recipients={askable.map((m) => ({
                id: m.id,
                name: m.name,
                email: m.email,
                avatarUrl: m.avatarUrl,
              }))}
              variant="labelled"
              label="Email"
            />
          )}
          {!composing && askable.length > 0 && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<ChatBubblesQuestion20Regular className="h-4 w-4" />}
              onClick={() => setComposing(true)}
            >
              Νέα ερώτηση
            </Button>
          )}
        </div>
      </div>

      {askable.length === 0 && (
        <p className="text-xs text-fluent-neutral-60 bg-fluent-neutral-4 rounded-lg px-3 py-2">
          Πρόσθεσε μέλη στο έργο για να μπορείς να θέσεις ερωτήσεις.
        </p>
      )}

      <AnimatePresence initial={false}>
        {composing && (
          <motion.div
            key="composer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <NewQuestionComposer
              projectId={projectId}
              taskId={taskId}
              members={askable}
              onCancel={() => setComposing(false)}
              onCreated={() => {
                setComposing(false);
                refresh();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {roots.length === 0 ? (
        !composing && (
          <div className="rounded-xl border border-dashed border-fluent-neutral-20 px-4 py-6 text-center">
            <ChatBubblesQuestion20Regular className="h-8 w-8 mx-auto text-fluent-neutral-40 mb-2" />
            <p className="text-sm text-fluent-neutral-70 font-medium">Καμία ερώτηση ακόμη</p>
            <p className="text-xs text-fluent-neutral-60 mt-1">
              Ζήτησε διευκρινίσεις από κάποιο μέλος της εργασίας.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {/* Pending: always visible */}
          {pendingRoots.map((root) => (
            <QuestionThread
              key={root.id}
              projectId={projectId}
              taskId={taskId}
              root={root}
              childrenByParent={childrenByParent}
              members={askable}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              onChanged={refresh}
            />
          ))}

          {/* Empty hint when nothing pending but history exists */}
          {pendingCount === 0 && answeredCount > 0 && (
            <div className="rounded-lg border border-fluent-accent-green/20 bg-fluent-accent-green/5 px-3 py-2 inline-flex items-center gap-2 text-xs text-fluent-accent-green">
              <CheckmarkCircle20Filled className="h-4 w-4" />
              Όλες οι ερωτήσεις έχουν απαντηθεί
            </div>
          )}

          {/* History accordion: collapsed by default. Holds fully-answered threads. */}
          {answeredCount > 0 && (
            <HistoryAccordion
              count={answeredCount}
              open={historyOpen}
              onToggle={() => setHistoryOpen((v) => !v)}
            >
              <div className="space-y-3 pt-2">
                {answeredRoots.map((root) => (
                  <QuestionThread
                    key={root.id}
                    projectId={projectId}
                    taskId={taskId}
                    root={root}
                    childrenByParent={childrenByParent}
                    members={askable}
                    currentUserId={currentUserId}
                    isPrivileged={isPrivileged}
                    onChanged={refresh}
                  />
                ))}
              </div>
            </HistoryAccordion>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionThread({
  projectId,
  taskId,
  root,
  childrenByParent,
  members,
  currentUserId,
  isPrivileged,
  onChanged,
}: {
  projectId: string;
  taskId: string;
  root: TaskQuestionInfo;
  childrenByParent: Map<string, TaskQuestionInfo[]>;
  members: ProjectMemberOption[];
  currentUserId: string;
  isPrivileged: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-2">
      <QuestionCard
        projectId={projectId}
        taskId={taskId}
        question={root}
        currentUserId={currentUserId}
        isPrivileged={isPrivileged}
        askableMembers={members}
        onChanged={onChanged}
      />
      <FollowUpList
        parentId={root.id}
        projectId={projectId}
        taskId={taskId}
        childrenByParent={childrenByParent}
        members={members}
        currentUserId={currentUserId}
        isPrivileged={isPrivileged}
        onChanged={onChanged}
      />
    </div>
  );
}

function FollowUpList({
  parentId,
  projectId,
  taskId,
  childrenByParent,
  members,
  currentUserId,
  isPrivileged,
  onChanged,
}: {
  parentId: string;
  projectId: string;
  taskId: string;
  childrenByParent: Map<string, TaskQuestionInfo[]>;
  members: ProjectMemberOption[];
  currentUserId: string;
  isPrivileged: boolean;
  onChanged: () => void;
}) {
  const children = childrenByParent.get(parentId) ?? [];
  if (children.length === 0) return null;
  return (
    <div className="pl-5 ml-2 border-l-2 border-fluent-blue-100 space-y-2">
      {children.map((child) => (
        <div key={child.id} className="space-y-2">
          <QuestionCard
            projectId={projectId}
            taskId={taskId}
            question={child}
            currentUserId={currentUserId}
            isPrivileged={isPrivileged}
            askableMembers={members}
            onChanged={onChanged}
          />
          <FollowUpList
            parentId={child.id}
            projectId={projectId}
            taskId={taskId}
            childrenByParent={childrenByParent}
            members={members}
            currentUserId={currentUserId}
            isPrivileged={isPrivileged}
            onChanged={onChanged}
          />
        </div>
      ))}
    </div>
  );
}

function HistoryAccordion({
  count,
  open,
  onToggle,
  children,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-fluent-neutral-10 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-fluent-neutral-4 transition-colors"
      >
        <div className="inline-flex items-center gap-2 min-w-0">
          <History20Regular className="h-4 w-4 text-fluent-neutral-60 shrink-0" />
          <span className="text-sm font-semibold text-fluent-neutral-90 truncate">
            Ιστορικό απαντημένων ερωτήσεων
          </span>
          <span className="text-[11px] font-medium text-fluent-neutral-60 px-1.5 py-0.5 rounded-full bg-fluent-neutral-8 shrink-0">
            {count}
          </span>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-fluent-neutral-60 shrink-0"
        >
          <ChevronDown20Regular className="h-4 w-4" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="history-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-fluent-neutral-10">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function NewQuestionComposer({
  projectId,
  taskId,
  members,
  parentId,
  onCancel,
  onCreated,
}: {
  projectId: string;
  taskId: string;
  members: ProjectMemberOption[];
  parentId?: string | null;
  onCancel: () => void;
  onCreated: (questionId: string) => void;
}) {
  const [askedToId, setAskedToId] = useState<string>(members[0]?.id ?? '');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    setError(null);
    if (!askedToId) {
      setError('Επίλεξε παραλήπτη.');
      return;
    }
    if (question.trim().length < 2) {
      setError('Γράψε την ερώτησή σου.');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('askedToId', askedToId);
      fd.set('question', question.trim());
      if (parentId) fd.set('parentId', parentId);
      const res = await askTaskQuestion(projectId, taskId, fd);
      if (!res.ok) {
        setError(res.error ?? 'Σφάλμα.');
        return;
      }
      if (pendingFile && res.id) {
        setUploadProgress({ loaded: 0, total: pendingFile.size, pct: 0 });
        const upRes = await uploadFileWithProgress<{ ok: boolean; error?: string }>({
          url: `/api/upload/question-attachment/${res.id}`,
          file: pendingFile,
          fields: {
            kind: 'question',
            ...(fileTitle.trim() ? { title: fileTitle.trim() } : {}),
          },
          onProgress: (p) => setUploadProgress(p),
        });
        setUploadProgress(null);
        if (!upRes.ok) {
          setError(upRes.data?.error ?? upRes.error ?? 'Δημιουργήθηκε η ερώτηση, αλλά απέτυχε το αρχείο.');
          onCreated(res.id);
          return;
        }
      }
      onCreated(res.id);
    });
  }

  const target = members.find((m) => m.id === askedToId);

  return (
    // Not a <form> element: this composer is rendered inside the parent TaskForm's <form>,
    // and HTML forbids nested forms. Submit is triggered via the button's onClick.
    <div
      role="group"
      aria-label="Νέα ερώτηση"
      className="bg-fluent-blue-50 border border-fluent-blue-200 rounded-xl p-3 mb-3 space-y-3"
    >
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-fluent-blue-700 mb-1.5">
          Προς
        </label>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const active = m.id === askedToId;
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => setAskedToId(m.id)}
                className={`text-xs pl-1 pr-2.5 py-0.5 rounded-full border transition-all inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-fluent-blue-600 text-white border-transparent shadow-fluent-2'
                    : 'bg-white border-fluent-neutral-20 text-fluent-neutral-80 hover:border-fluent-blue-300'
                }`}
              >
                <Avatar
                  user={{ name: m.name || m.email, avatarUrl: m.avatarUrl }}
                  size="xs"
                />
                {m.name || m.email}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-fluent-blue-700 mb-1.5">
          Η ερώτησή σου{target ? ` προς ${target.name || target.email}` : ''}
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="π.χ. Ποια προθεσμία ισχύει για την παράδοση της φάσης Α;"
          className="w-full px-3 py-2 rounded-md border border-fluent-blue-200 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none resize-none"
          autoFocus
          maxLength={4000}
        />
      </div>

      {pendingFile ? (
        <div className="bg-white border border-fluent-blue-200 rounded-md p-2.5 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <FileIcon mimeType={pendingFile.type} />
            <span className="flex-1 min-w-0 truncate font-medium text-fluent-neutral-90">
              {pendingFile.name}
            </span>
            <span className="text-[11px] text-fluent-neutral-60 tabular-nums">
              {formatBytes(pendingFile.size)}
            </span>
            <button
              type="button"
              onClick={() => {
                setPendingFile(null);
                setFileTitle('');
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="h-6 w-6 rounded hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
              aria-label="Αφαίρεση αρχείου"
            >
              <Dismiss20Regular className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={fileTitle}
            onChange={(e) => setFileTitle(e.target.value)}
            placeholder="Περιγραφή αρχείου (προαιρ.)"
            className="w-full h-8 px-2 rounded-md border border-fluent-neutral-20 text-xs focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-fluent-blue-700 hover:text-fluent-blue-800 font-medium inline-flex items-center gap-1.5"
        >
          <Attach20Regular className="h-4 w-4" />
          Επισύναψη αρχείου (προαιρ.)
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPendingFile(f);
        }}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-3 py-1.5">
          {error}
        </div>
      )}

      {uploadProgress && (
        <UploadProgressBar progress={uploadProgress} />
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          Ακύρωση
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<Send20Regular className="h-4 w-4" />}
          onClick={handleSubmit}
          disabled={pending}
        >
          {pending
            ? uploadProgress
              ? `Μεταφόρτωση… ${uploadProgress.pct}%`
              : 'Αποστολή…'
            : 'Αποστολή ερώτησης'}
        </Button>
      </div>
    </div>
  );
}

function UploadProgressBar({ progress }: { progress: UploadProgress }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-fluent-neutral-70 tabular-nums">
        <span>{progress.pct}%</span>
        <span>
          {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-fluent-neutral-10 overflow-hidden">
        <div
          className="h-full bg-fluent-blue-500 transition-all duration-200"
          style={{ width: `${progress.pct}%` }}
        />
      </div>
    </div>
  );
}

export function QuestionCard({
  projectId,
  taskId,
  question,
  currentUserId,
  isPrivileged,
  askableMembers,
  onChanged,
}: {
  projectId: string;
  taskId: string;
  question: TaskQuestionInfo;
  currentUserId: string;
  isPrivileged: boolean;
  askableMembers?: ProjectMemberOption[];
  onChanged: () => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [followingUp, setFollowingUp] = useState(false);
  const [, startTransition] = useTransition();
  const isAskee = question.askedTo.id === currentUserId;
  const isAsker = question.askedBy.id === currentUserId;
  const canDelete = isAsker || isPrivileged;
  const canAnswer = !question.answer && (isAskee || isPrivileged);
  const canFollowUp = !!question.answer && (askableMembers?.length ?? 0) > 0;

  const questionAttachments = question.attachments.filter((a) => a.kind === 'question');
  const answerAttachments = question.attachments.filter((a) => a.kind === 'answer');

  function handleDelete() {
    if (!confirm('Να διαγραφεί η ερώτηση και η απάντηση;')) return;
    startTransition(async () => {
      await deleteTaskQuestion(projectId, question.id);
      onChanged();
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2 overflow-hidden"
    >
      {/* Question header */}
      <div className="p-3 bg-gradient-to-r from-fluent-blue-50 to-white border-b border-black/5">
        <div className="flex items-start gap-2.5">
          <Avatar
            user={{ name: question.askedBy.name || question.askedBy.email, avatarUrl: question.askedBy.avatarUrl }}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
              <span className="font-semibold text-fluent-neutral-90 truncate max-w-[140px]">
                {question.askedBy.name || question.askedBy.email}
              </span>
              <span className="text-fluent-neutral-50">ρώτησε</span>
              <ArrowReply20Regular className="h-3.5 w-3.5 text-fluent-neutral-40 -rotate-180" />
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-fluent-blue-100 text-fluent-blue-700">
                <Person20Regular className="h-3 w-3" />
                <span className="font-semibold">
                  {question.askedTo.name || question.askedTo.email}
                </span>
              </span>
              <span className="text-fluent-neutral-50">·</span>
              <span className="text-fluent-neutral-60">{formatRelative(question.createdAt)}</span>
              <StatusPill answered={!!question.answer} />
            </div>
            <p className="mt-1.5 text-sm text-fluent-neutral-90 whitespace-pre-wrap break-words">
              {question.question}
            </p>
            {questionAttachments.length > 0 && (
              <AttachmentList
                projectId={projectId}
                attachments={questionAttachments}
                currentUserId={currentUserId}
                isPrivileged={isPrivileged}
                onChanged={onChanged}
              />
            )}
          </div>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="h-7 w-7 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60 shrink-0"
              aria-label="Διαγραφή"
              title="Διαγραφή ερώτησης"
            >
              <Delete20Regular className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Answer area */}
      {question.answer ? (
        <div className="p-3 bg-fluent-neutral-2">
          <div className="flex items-start gap-2.5 pl-6">
            <div className="absolute -ml-3 mt-2 h-px w-3 bg-fluent-neutral-20" aria-hidden />
            <Avatar
              user={{ name: question.askedTo.name || question.askedTo.email, avatarUrl: question.askedTo.avatarUrl }}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
                <span className="font-semibold text-fluent-neutral-90 truncate max-w-[160px]">
                  {question.askedTo.name || question.askedTo.email}
                </span>
                <span className="text-fluent-neutral-50">απάντησε</span>
                <span className="text-fluent-neutral-50">·</span>
                <span className="text-fluent-neutral-60">
                  {question.answeredAt ? formatRelative(question.answeredAt) : ''}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-fluent-neutral-90 whitespace-pre-wrap break-words">
                {question.answer}
              </p>
              {answerAttachments.length > 0 && (
                <AttachmentList
                  projectId={projectId}
                  attachments={answerAttachments}
                  currentUserId={currentUserId}
                  isPrivileged={isPrivileged}
                  onChanged={onChanged}
                />
              )}
              {(isAskee || isPrivileged) && (
                <AnswerAttachmentUploader
                  projectId={projectId}
                  questionId={question.id}
                  onUploaded={onChanged}
                />
              )}
            </div>
          </div>
          {canFollowUp && (
            <div className="mt-3 pl-6">
              <AnimatePresence initial={false}>
                {followingUp ? (
                  <motion.div
                    key="followup"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <NewQuestionComposer
                      projectId={projectId}
                      taskId={taskId}
                      members={askableMembers!}
                      parentId={question.id}
                      onCancel={() => setFollowingUp(false)}
                      onCreated={() => {
                        setFollowingUp(false);
                        onChanged();
                      }}
                    />
                  </motion.div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFollowingUp(true)}
                    className="text-xs text-fluent-blue-700 hover:text-fluent-blue-800 font-medium inline-flex items-center gap-1.5"
                  >
                    <ArrowReply20Regular className="h-4 w-4" />
                    Νέα ερώτηση σε αυτή την απάντηση
                  </button>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : canAnswer ? (
        answering ? (
          <AnswerComposer
            projectId={projectId}
            questionId={question.id}
            onCancel={() => setAnswering(false)}
            onAnswered={() => {
              setAnswering(false);
              onChanged();
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAnswering(true)}
            className="w-full px-3 py-2.5 text-left text-sm text-fluent-blue-700 hover:bg-fluent-blue-50 inline-flex items-center gap-2 border-t border-black/5"
          >
            <ArrowReply20Regular className="h-4 w-4" />
            <span className="font-medium">Απάντηση…</span>
          </button>
        )
      ) : (
        <div className="px-3 py-2 text-xs text-fluent-neutral-60 bg-fluent-neutral-2 inline-flex items-center gap-1.5 w-full">
          <ClockArrowDownload20Regular className="h-4 w-4" />
          Σε αναμονή απάντησης από τον/την {question.askedTo.name || question.askedTo.email}
        </div>
      )}
    </motion.div>
  );
}

function StatusPill({ answered }: { answered: boolean }) {
  if (answered) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-fluent-accent-green/10 text-fluent-accent-green text-[10px] font-semibold uppercase tracking-wide">
        <CheckmarkCircle20Filled className="h-3 w-3" />
        Απαντήθηκε
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-fluent-accent-orange/10 text-fluent-accent-orange text-[10px] font-semibold uppercase tracking-wide">
      Εκκρεμεί
    </span>
  );
}

function AnswerComposer({
  projectId,
  questionId,
  onCancel,
  onAnswered,
}: {
  projectId: string;
  questionId: string;
  onCancel: () => void;
  onAnswered: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    setError(null);
    if (answer.trim().length < 1) {
      setError('Γράψε την απάντησή σου.');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('answer', answer.trim());
      const res = await answerTaskQuestion(projectId, questionId, fd);
      if (!res.ok) {
        setError(res.error ?? 'Σφάλμα.');
        return;
      }
      if (pendingFile) {
        setUploadProgress({ loaded: 0, total: pendingFile.size, pct: 0 });
        const upRes = await uploadFileWithProgress<{ ok: boolean; error?: string }>({
          url: `/api/upload/question-attachment/${questionId}`,
          file: pendingFile,
          fields: {
            kind: 'answer',
            ...(fileTitle.trim() ? { title: fileTitle.trim() } : {}),
          },
          onProgress: (p) => setUploadProgress(p),
        });
        setUploadProgress(null);
        if (!upRes.ok) {
          setError(upRes.data?.error ?? upRes.error ?? 'Στάλθηκε η απάντηση, αλλά απέτυχε το αρχείο.');
          onAnswered();
          return;
        }
      }
      onAnswered();
    });
  }

  return (
    // Not a <form>: rendered inside parent TaskForm's <form>; submit goes via button onClick.
    <div role="group" aria-label="Απάντηση" className="p-3 bg-white border-t border-black/5 space-y-2.5">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        placeholder="Η απάντησή σου…"
        className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none resize-none"
        autoFocus
        maxLength={4000}
      />

      {pendingFile ? (
        <div className="bg-fluent-neutral-2 border border-fluent-neutral-20 rounded-md p-2 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <FileIcon mimeType={pendingFile.type} />
            <span className="flex-1 min-w-0 truncate font-medium text-fluent-neutral-90">
              {pendingFile.name}
            </span>
            <span className="text-[11px] text-fluent-neutral-60 tabular-nums">
              {formatBytes(pendingFile.size)}
            </span>
            <button
              type="button"
              onClick={() => {
                setPendingFile(null);
                setFileTitle('');
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="h-6 w-6 rounded hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
              aria-label="Αφαίρεση"
            >
              <Dismiss20Regular className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={fileTitle}
            onChange={(e) => setFileTitle(e.target.value)}
            placeholder="Περιγραφή αρχείου (προαιρ.)"
            className="w-full h-8 px-2 rounded-md border border-fluent-neutral-20 text-xs focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-fluent-blue-700 hover:text-fluent-blue-800 font-medium inline-flex items-center gap-1.5"
        >
          <Attach20Regular className="h-4 w-4" />
          Επισύναψη αρχείου (προαιρ.)
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPendingFile(f);
        }}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-3 py-1.5">
          {error}
        </div>
      )}

      {uploadProgress && <UploadProgressBar progress={uploadProgress} />}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          Ακύρωση
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<Send20Regular className="h-4 w-4" />}
          onClick={handleSubmit}
          disabled={pending}
        >
          {pending
            ? uploadProgress
              ? `Μεταφόρτωση… ${uploadProgress.pct}%`
              : 'Αποστολή…'
            : 'Αποστολή απάντησης'}
        </Button>
      </div>
    </div>
  );
}

function AnswerAttachmentUploader({
  projectId,
  questionId,
  onUploaded,
}: {
  projectId: string;
  questionId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  // projectId no longer needed for the upload itself (route handler resolves
  // it from the questionId), but we keep the param for API stability.
  void projectId;

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    setProgress({ loaded: 0, total: pendingFile.size, pct: 0 });

    const res = await uploadFileWithProgress<{ ok: boolean; error?: string }>({
      url: `/api/upload/question-attachment/${questionId}`,
      file: pendingFile,
      fields: {
        kind: 'answer',
        ...(title.trim() ? { title: title.trim() } : {}),
      },
      onProgress: (p) => setProgress(p),
    });
    setUploading(false);
    setProgress(null);

    if (!res.ok) {
      setError(res.data?.error ?? res.error ?? 'Σφάλμα μεταφόρτωσης.');
      return;
    }
    setPendingFile(null);
    setTitle('');
    if (inputRef.current) inputRef.current.value = '';
    onUploaded();
  }

  if (!pendingFile) {
    return (
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-2 text-[11px] text-fluent-blue-700 hover:text-fluent-blue-800 font-medium inline-flex items-center gap-1"
      >
        <Attach20Regular className="h-3.5 w-3.5" />
        Προσθήκη αρχείου στην απάντηση
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingFile(f);
          }}
        />
      </button>
    );
  }

  return (
    <div className="mt-2 bg-white border border-fluent-blue-200 rounded-md p-2 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <FileIcon mimeType={pendingFile.type} />
        <span className="flex-1 min-w-0 truncate text-fluent-neutral-90">{pendingFile.name}</span>
        <span className="text-[11px] text-fluent-neutral-60 tabular-nums">{formatBytes(pendingFile.size)}</span>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Περιγραφή (προαιρ.)"
        className="w-full h-8 px-2 rounded-md border border-fluent-neutral-20 text-xs focus:border-fluent-blue-500 focus:outline-none"
      />
      {error && (
        <p className="text-[11px] text-red-700">{error}</p>
      )}
      {progress && <UploadProgressBar progress={progress} />}
      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setPendingFile(null);
            setTitle('');
            setError(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
          disabled={uploading}
        >
          Ακύρωση
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={handleUpload} disabled={uploading}>
          {uploading ? `Μεταφόρτωση… ${progress?.pct ?? 0}%` : 'Ανέβασμα'}
        </Button>
      </div>
    </div>
  );
}

function AttachmentList({
  projectId,
  attachments,
  currentUserId,
  isPrivileged,
  onChanged,
}: {
  projectId: string;
  attachments: QuestionAttachmentInfo[];
  currentUserId: string;
  isPrivileged: boolean;
  onChanged: () => void;
}) {
  const [, startTransition] = useTransition();

  function handleRemove(id: string) {
    if (!confirm('Να αφαιρεθεί το συνημμένο;')) return;
    startTransition(async () => {
      await deleteQuestionAttachment(projectId, id);
      onChanged();
    });
  }

  return (
    <ul className="mt-2 space-y-1">
      {attachments.map((a) => {
        const canRemove = a.uploadedById === currentUserId || isPrivileged;
        return (
          <li
            key={a.id}
            className="inline-flex items-center gap-2 text-xs rounded-md border border-fluent-neutral-20 bg-white px-2 py-1 mr-1.5 max-w-full"
          >
            <FileIcon mimeType={a.mimeType} />
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-fluent-blue-700 hover:underline font-medium max-w-[180px]"
              title={a.title ?? a.name}
            >
              {a.title || a.name}
            </a>
            <span className="text-[10px] text-fluent-neutral-60 tabular-nums">
              {formatBytes(a.size)}
            </span>
            {canRemove && (
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                className="h-5 w-5 rounded hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-50"
                aria-label="Αφαίρεση"
              >
                <Dismiss20Regular className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image20Regular className="h-4 w-4 text-fluent-blue-600 shrink-0" />;
  if (mimeType === 'application/pdf') return <DocumentPdf20Regular className="h-4 w-4 text-fluent-accent-red shrink-0" />;
  return <Document20Regular className="h-4 w-4 text-fluent-neutral-60 shrink-0" />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatRelative(d: Date): string {
  const now = Date.now();
  const t = d.getTime();
  const diffMs = now - t;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return 'μόλις τώρα';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} λεπτά πριν`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ώρες πριν`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ημέρες πριν`;
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });
}
