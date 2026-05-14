'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChatBubblesQuestion24Regular,
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
  Open20Regular,
  Search20Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  askTaskQuestion,
  answerTaskQuestion,
  deleteTaskQuestion,
  uploadQuestionAttachment,
  deleteQuestionAttachment,
} from '@/app/(app)/projects/[id]/question-actions';
import type { ProjectMemberOption } from '@/app/(app)/projects/[id]/task-questions-panel';

type UserMini = { id: string; name: string; email: string; avatarUrl?: string };
type QuestionAttachment = {
  id: string;
  kind: 'question' | 'answer';
  uploadedById: string;
  name: string;
  title: string | null;
  size: number;
  mimeType: string;
  url: string;
};

export type QuestionListItem = {
  id: string;
  parentId: string | null;
  question: string;
  answer: string | null;
  createdAt: Date;
  answeredAt: Date | null;
  askedBy: UserMini;
  askedTo: UserMini;
  attachments: QuestionAttachment[];
  task: {
    id: string;
    title: string;
    status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dueDate: Date | null;
    project: {
      id: string;
      name: string;
      color: string;
    };
  };
};

type Tab = 'incoming' | 'outgoing' | 'all';

const PRIORITY_LABEL: Record<QuestionListItem['task']['priority'], string> = {
  urgent: 'Επείγουσα',
  high: 'Υψηλή',
  medium: 'Μεσαία',
  low: 'Χαμηλή',
};
const PRIORITY_VARIANT: Record<QuestionListItem['task']['priority'], 'red' | 'orange' | 'blue' | 'neutral'> = {
  urgent: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'neutral',
};

type Thread = {
  root: QuestionListItem;
  // Flat sequence of all nodes in the thread including the root, ordered chronologically.
  nodes: QuestionListItem[];
  // parentId → ordered children. Used to render arbitrary depth.
  childrenByParent: Map<string, QuestionListItem[]>;
};

export function QuestionsClient({
  currentUserId,
  isPrivileged,
  questions,
  projectMembers,
}: {
  currentUserId: string;
  isPrivileged: boolean;
  questions: QuestionListItem[];
  projectMembers: Record<string, ProjectMemberOption[]>;
}) {
  const [tab, setTab] = useState<Tab>('incoming');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'answered'>('all');
  const [search, setSearch] = useState('');

  // Build threads. Anything without a parent (or whose parent isn't in the set)
  // becomes a root.
  const threads: Thread[] = useMemo(() => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const childrenByParent = new Map<string, QuestionListItem[]>();
    const roots: QuestionListItem[] = [];
    for (const q of questions) {
      if (q.parentId && byId.has(q.parentId)) {
        if (!childrenByParent.has(q.parentId)) childrenByParent.set(q.parentId, []);
        childrenByParent.get(q.parentId)!.push(q);
      } else {
        roots.push(q);
      }
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    roots.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return roots.map((root) => {
      const nodes: QuestionListItem[] = [];
      const stack: QuestionListItem[] = [root];
      while (stack.length) {
        const n = stack.shift()!;
        nodes.push(n);
        for (const c of childrenByParent.get(n.id) ?? []) stack.push(c);
      }
      return { root, nodes, childrenByParent };
    });
  }, [questions]);

  // Filter threads: keep any thread where any node matches the current
  // tab/status/search; the thread is shown in full so context isn't lost.
  const visibleThreads = useMemo(() => {
    const s = search.trim().toLowerCase();

    function tabMatchesNode(q: QuestionListItem): boolean {
      if (tab === 'incoming') return q.askedTo.id === currentUserId;
      if (tab === 'outgoing') return q.askedBy.id === currentUserId;
      return true;
    }
    function statusMatchesNode(q: QuestionListItem): boolean {
      if (statusFilter === 'pending') return !q.answer;
      if (statusFilter === 'answered') return !!q.answer;
      return true;
    }
    function searchMatchesThread(t: Thread): boolean {
      if (!s) return true;
      if (t.root.task.title.toLowerCase().includes(s)) return true;
      if (t.root.task.project.name.toLowerCase().includes(s)) return true;
      for (const n of t.nodes) {
        const hay =
          (n.question + ' ' + (n.answer ?? '') +
            ' ' + n.askedBy.name + ' ' + n.askedTo.name).toLowerCase();
        if (hay.includes(s)) return true;
      }
      return false;
    }

    return threads
      .filter((t) => t.nodes.some((n) => tabMatchesNode(n) && statusMatchesNode(n)))
      .filter(searchMatchesThread)
      .sort((a, b) => {
        // Sort by latest activity descending; pending threads come first.
        const aPending = a.nodes.some((n) => !n.answer);
        const bPending = b.nodes.some((n) => !n.answer);
        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;
        const aLast = Math.max(
          ...a.nodes.map((n) => (n.answeredAt ?? n.createdAt).getTime()),
        );
        const bLast = Math.max(
          ...b.nodes.map((n) => (n.answeredAt ?? n.createdAt).getTime()),
        );
        return bLast - aLast;
      });
  }, [threads, tab, statusFilter, search, currentUserId]);

  // Counts: incoming/outgoing pending at the node level (matches inbox semantics).
  const incomingPending = useMemo(
    () =>
      questions.filter((q) => q.askedTo.id === currentUserId && !q.answer).length,
    [questions, currentUserId],
  );
  const outgoingPending = useMemo(
    () =>
      questions.filter((q) => q.askedBy.id === currentUserId && !q.answer).length,
    [questions, currentUserId],
  );

  const totalPending = incomingPending;
  const avgResponseMs = computeAvgResponseMs(questions);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-fluent-blue-50 flex items-center justify-center">
              <ChatBubblesQuestion24Regular className="h-6 w-6 text-fluent-blue-600" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-fluent-neutral-95 tracking-tight">
                Ερωτήσεις
              </h1>
              <p className="text-sm text-fluent-neutral-60 mt-0.5">
                Ερωτήσεις προς εσένα και ερωτήσεις που έχεις θέσει.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatTile
            label="Εκκρεμούν για εσένα"
            value={incomingPending}
            tone={incomingPending > 0 ? 'warn' : 'neutral'}
          />
          <StatTile label="Σε αναμονή απάντησης" value={outgoingPending} tone="neutral" />
          {avgResponseMs !== null && (
            <StatTile label="Μέσος χρόνος απόκρισης" value={formatDuration(avgResponseMs)} tone="neutral" />
          )}
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex items-center bg-fluent-neutral-4 rounded-lg p-1">
          <TabButton active={tab === 'incoming'} onClick={() => setTab('incoming')} count={incomingPending} hot={incomingPending > 0}>
            Προς εμένα
          </TabButton>
          <TabButton active={tab === 'outgoing'} onClick={() => setTab('outgoing')}>
            Από εμένα
          </TabButton>
          <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
            Όλες
          </TabButton>
        </div>

        <div className="inline-flex items-center bg-fluent-neutral-4 rounded-lg p-1">
          {(['all', 'pending', 'answered'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs h-7 px-3 rounded-md font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-white text-fluent-blue-700 shadow-fluent-2'
                  : 'text-fluent-neutral-70 hover:bg-white/60'
              }`}
            >
              {s === 'all' ? 'Όλες' : s === 'pending' ? 'Εκκρεμούν' : 'Απαντημένες'}
            </button>
          ))}
        </div>

        <div className="ml-auto relative w-full sm:w-72">
          <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fluent-neutral-50" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Αναζήτηση…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {visibleThreads.length === 0 ? (
        <EmptyState tab={tab} statusFilter={statusFilter} hasAny={threads.length > 0} totalPending={totalPending} />
      ) : (
        <div className="space-y-3">
          {visibleThreads.map((t) => (
            <ThreadCard
              key={t.root.id}
              thread={t}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              members={projectMembers[t.root.task.project.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  hot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  hot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 text-sm h-8 px-3 rounded-md font-medium transition-colors ${
        active
          ? 'bg-white text-fluent-blue-700 shadow-fluent-2'
          : 'text-fluent-neutral-70 hover:bg-white/60'
      }`}
    >
      {children}
      {typeof count === 'number' && count > 0 && (
        <span
          className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
            hot
              ? 'bg-fluent-accent-orange text-white'
              : 'bg-fluent-neutral-10 text-fluent-neutral-80'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: 'neutral' | 'warn';
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-2 min-w-[140px] ${
        tone === 'warn'
          ? 'bg-fluent-accent-orange/8 border-fluent-accent-orange/30'
          : 'bg-white border-black/5 shadow-fluent-2'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold text-fluent-neutral-50">
        {label}
      </div>
      <div
        className={`text-xl font-semibold font-display tabular-nums ${
          tone === 'warn' ? 'text-fluent-accent-orange' : 'text-fluent-neutral-95'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  tab,
  statusFilter,
  hasAny,
  totalPending,
}: {
  tab: Tab;
  statusFilter: 'all' | 'pending' | 'answered';
  hasAny: boolean;
  totalPending: number;
}) {
  let title = 'Καμία ερώτηση εδώ';
  let body = '';
  if (!hasAny) {
    if (tab === 'incoming') {
      title = 'Δεν έχεις λάβει ερωτήσεις';
      body = totalPending === 0
        ? 'Όταν κάποιο μέλος έργου σου θέσει ερώτηση σε εργασία, θα εμφανιστεί εδώ.'
        : '';
    } else if (tab === 'outgoing') {
      title = 'Δεν έχεις θέσει ερωτήσεις';
      body = 'Άνοιξε μια εργασία και ζήτα διευκρινίσεις από κάποιο μέλος του έργου.';
    } else {
      title = 'Καμία ερώτηση ακόμη';
      body = 'Άνοιξε μια εργασία για να ξεκινήσεις μια συνομιλία.';
    }
  } else if (statusFilter === 'pending') {
    title = 'Δεν εκκρεμεί τίποτα';
    body = 'Όλες οι ερωτήσεις σε αυτή την προβολή έχουν απαντηθεί.';
  } else if (statusFilter === 'answered') {
    title = 'Καμία απαντημένη ερώτηση';
    body = 'Όταν απαντηθούν, θα εμφανίζονται εδώ.';
  }

  return (
    <div className="rounded-2xl border border-dashed border-fluent-neutral-20 px-6 py-16 text-center bg-white">
      <ChatBubblesQuestion24Regular className="h-10 w-10 mx-auto text-fluent-neutral-40 mb-3" />
      <p className="text-base font-semibold text-fluent-neutral-90">{title}</p>
      {body && <p className="text-sm text-fluent-neutral-60 mt-1 max-w-md mx-auto">{body}</p>}
    </div>
  );
}

function ThreadCard({
  thread,
  currentUserId,
  isPrivileged,
  members,
}: {
  thread: Thread;
  currentUserId: string;
  isPrivileged: boolean;
  members: ProjectMemberOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const root = thread.root;
  const isRootAsker = root.askedBy.id === currentUserId;
  const rootCanDelete = isRootAsker || isPrivileged;

  function handleDeleteRoot() {
    if (!confirm('Να διαγραφεί ολόκληρο το νήμα (ερωτήσεις, απαντήσεις, follow-ups);'))
      return;
    startTransition(async () => {
      await deleteTaskQuestion(root.task.project.id, root.id);
      router.refresh();
    });
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-white rounded-2xl border border-black/5 shadow-fluent-2 overflow-hidden"
    >
      {/* Project accent stripe */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: root.task.project.color }}
        aria-hidden
      />

      {/* Task header (shared by the whole thread) */}
      <div className="pl-5 pr-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/projects/${root.task.project.id}`}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider hover:underline"
            style={{ color: root.task.project.color }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: root.task.project.color }}
            />
            {root.task.project.name}
          </Link>
          <h3 className="mt-1 font-display text-base font-semibold text-fluent-neutral-95 truncate">
            {root.task.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={PRIORITY_VARIANT[root.task.priority]}>
              {PRIORITY_LABEL[root.task.priority]}
            </Badge>
            {root.task.dueDate && (
              <span className="inline-flex items-center text-[11px] text-fluent-neutral-60 px-2 py-0.5 rounded-full bg-fluent-neutral-4">
                Λήξη {formatDate(root.task.dueDate)}
              </span>
            )}
            {thread.nodes.length > 1 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-fluent-blue-100 text-fluent-blue-700">
                <ChatBubblesQuestion20Regular className="h-3 w-3" />
                {thread.nodes.length} μηνύματα
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href={`/projects/${root.task.project.id}`}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
            aria-label="Άνοιγμα εργασίας"
            title="Άνοιγμα εργασίας"
          >
            <Open20Regular className="h-4 w-4" />
          </Link>
          {rootCanDelete && (
            <button
              type="button"
              onClick={handleDeleteRoot}
              className="h-8 w-8 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60"
              aria-label="Διαγραφή"
              title="Διαγραφή νήματος"
            >
              <Delete20Regular className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <ThreadBody
        node={root}
        thread={thread}
        currentUserId={currentUserId}
        isPrivileged={isPrivileged}
        members={members}
        depth={0}
        onChanged={refresh}
      />
    </motion.article>
  );
}

function ThreadBody({
  node,
  thread,
  currentUserId,
  isPrivileged,
  members,
  depth,
  onChanged,
}: {
  node: QuestionListItem;
  thread: Thread;
  currentUserId: string;
  isPrivileged: boolean;
  members: ProjectMemberOption[];
  depth: number;
  onChanged: () => void;
}) {
  const children = thread.childrenByParent.get(node.id) ?? [];
  return (
    <>
      <QAExchange
        node={node}
        currentUserId={currentUserId}
        isPrivileged={isPrivileged}
        members={members}
        depth={depth}
        showDeleteForFollowUp={depth > 0}
        onChanged={onChanged}
      />
      {children.length > 0 && (
        <div className={depth === 0 ? '' : 'pl-3'}>
          {children.map((child) => (
            <ThreadBody
              key={child.id}
              node={child}
              thread={thread}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              members={members}
              depth={depth + 1}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </>
  );
}

function QAExchange({
  node,
  currentUserId,
  isPrivileged,
  members,
  depth,
  showDeleteForFollowUp,
  onChanged,
}: {
  node: QuestionListItem;
  currentUserId: string;
  isPrivileged: boolean;
  members: ProjectMemberOption[];
  depth: number;
  showDeleteForFollowUp: boolean;
  onChanged: () => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [followingUp, setFollowingUp] = useState(false);
  const [, startTransition] = useTransition();

  const isAskee = node.askedTo.id === currentUserId;
  const isAsker = node.askedBy.id === currentUserId;
  const canAnswer = !node.answer && (isAskee || isPrivileged);
  const canDelete = isAsker || isPrivileged;
  const askable = members.filter((m) => m.id !== currentUserId);
  const canFollowUp = !!node.answer && askable.length > 0;

  const questionAttachments = node.attachments.filter((a) => a.kind === 'question');
  const answerAttachments = node.attachments.filter((a) => a.kind === 'answer');

  const responseMs = node.answeredAt
    ? node.answeredAt.getTime() - node.createdAt.getTime()
    : null;
  const pendingMs = !node.answeredAt ? Date.now() - node.createdAt.getTime() : null;

  function handleDeleteNode() {
    if (!confirm('Να διαγραφεί αυτή η ερώτηση και τα follow-up της;')) return;
    startTransition(async () => {
      await deleteTaskQuestion(node.task.project.id, node.id);
      onChanged();
    });
  }

  const followUpIndicator = depth > 0 && (
    <div
      className="absolute left-3 top-0 bottom-0 w-px bg-fluent-blue-100"
      aria-hidden
    />
  );

  return (
    <div
      className={`relative ${
        depth > 0
          ? 'pl-6 ml-2 border-l-2 border-fluent-blue-100 bg-fluent-blue-50/10 mt-2'
          : ''
      }`}
    >
      {followUpIndicator}
      {/* Question body */}
      <div className={`px-5 ${depth > 0 ? 'pt-3' : 'pt-1'} pb-3`}>
        <div className="flex items-start gap-2.5">
          <Avatar
            user={{ name: node.askedBy.name || node.askedBy.email, avatarUrl: node.askedBy.avatarUrl }}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
              <span className="font-semibold text-fluent-neutral-90 truncate max-w-[160px]">
                {node.askedBy.name || node.askedBy.email}
              </span>
              <span className="text-fluent-neutral-50">
                {depth > 0 ? 'ξαναρώτησε' : 'ρώτησε'}
              </span>
              <ArrowReply20Regular className="h-3.5 w-3.5 text-fluent-neutral-40 -rotate-180" />
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-fluent-blue-100 text-fluent-blue-700">
                <Person20Regular className="h-3 w-3" />
                <span className="font-semibold">
                  {node.askedTo.name || node.askedTo.email}
                </span>
              </span>
              <span className="text-fluent-neutral-50">·</span>
              <time
                title={formatDateTime(node.createdAt)}
                className="text-fluent-neutral-60"
              >
                {formatRelative(node.createdAt)}
              </time>
              <StatusPill answered={!!node.answer} />
              {pendingMs !== null && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-fluent-accent-orange">
                  <ClockArrowDownload20Regular className="h-3 w-3" />
                  εκκρεμεί {formatDuration(pendingMs)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-fluent-neutral-90 whitespace-pre-wrap break-words">
              {node.question}
            </p>
            {questionAttachments.length > 0 && (
              <AttachmentList
                projectId={node.task.project.id}
                attachments={questionAttachments}
                currentUserId={currentUserId}
                isPrivileged={isPrivileged}
                onChanged={onChanged}
              />
            )}
          </div>
          {showDeleteForFollowUp && canDelete && (
            <button
              type="button"
              onClick={handleDeleteNode}
              className="h-7 w-7 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60 shrink-0"
              aria-label="Διαγραφή"
              title="Διαγραφή follow-up"
            >
              <Delete20Regular className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Answer area */}
      {node.answer ? (
        <div
          className={`px-5 py-3 ${
            depth > 0 ? 'bg-white' : 'bg-fluent-neutral-2'
          } border-t border-black/5`}
        >
          <div className="flex items-start gap-2.5 pl-5 relative">
            <span className="absolute left-0 top-3 h-px w-4 bg-fluent-neutral-20" aria-hidden />
            <Avatar
              user={{ name: node.askedTo.name || node.askedTo.email, avatarUrl: node.askedTo.avatarUrl }}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
                <span className="font-semibold text-fluent-neutral-90 truncate max-w-[160px]">
                  {node.askedTo.name || node.askedTo.email}
                </span>
                <span className="text-fluent-neutral-50">απάντησε</span>
                <span className="text-fluent-neutral-50">·</span>
                <time
                  title={node.answeredAt ? formatDateTime(node.answeredAt) : ''}
                  className="text-fluent-neutral-60"
                >
                  {node.answeredAt ? formatRelative(node.answeredAt) : ''}
                </time>
                {responseMs !== null && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-fluent-accent-green">
                    <CheckmarkCircle20Filled className="h-3 w-3" />
                    απόκριση σε {formatDuration(responseMs)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-fluent-neutral-90 whitespace-pre-wrap break-words">
                {node.answer}
              </p>
              {answerAttachments.length > 0 && (
                <AttachmentList
                  projectId={node.task.project.id}
                  attachments={answerAttachments}
                  currentUserId={currentUserId}
                  isPrivileged={isPrivileged}
                  onChanged={onChanged}
                />
              )}
              {(isAskee || isPrivileged) && (
                <AnswerAttachmentUploader
                  projectId={node.task.project.id}
                  questionId={node.id}
                  onUploaded={onChanged}
                />
              )}
              {canFollowUp && (
                <div className="mt-3">
                  <AnimatePresence initial={false}>
                    {followingUp ? (
                      <motion.div
                        key="followup-composer"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <FollowUpComposer
                          projectId={node.task.project.id}
                          taskId={node.task.id}
                          parentId={node.id}
                          members={askable}
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
                        className="text-xs text-fluent-blue-700 hover:text-fluent-blue-800 font-semibold inline-flex items-center gap-1.5"
                      >
                        <ArrowReply20Regular className="h-4 w-4" />
                        Νέα ερώτηση σε αυτή την απάντηση
                      </button>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : canAnswer ? (
        <AnimatePresence initial={false}>
          {answering ? (
            <motion.div
              key="composer"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <AnswerComposer
                projectId={node.task.project.id}
                questionId={node.id}
                onCancel={() => setAnswering(false)}
                onAnswered={() => {
                  setAnswering(false);
                  onChanged();
                }}
              />
            </motion.div>
          ) : (
            <button
              type="button"
              onClick={() => setAnswering(true)}
              className="w-full px-5 py-3 text-left text-sm text-fluent-blue-700 hover:bg-fluent-blue-50 inline-flex items-center gap-2 border-t border-black/5 font-semibold"
            >
              <ArrowReply20Regular className="h-4 w-4" />
              Απάντηση…
            </button>
          )}
        </AnimatePresence>
      ) : (
        <div className="px-5 py-3 text-xs text-fluent-neutral-60 bg-fluent-neutral-2 border-t border-black/5 inline-flex items-center gap-1.5 w-full">
          <ClockArrowDownload20Regular className="h-4 w-4" />
          Σε αναμονή απάντησης από τον/την {node.askedTo.name || node.askedTo.email}
        </div>
      )}
    </div>
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
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        const upload = new FormData();
        upload.set('file', pendingFile);
        if (fileTitle.trim()) upload.set('title', fileTitle.trim());
        const upRes = await uploadQuestionAttachment(projectId, questionId, 'answer', upload);
        if (!upRes.ok) {
          setError(upRes.error ?? 'Στάλθηκε η απάντηση, αλλά απέτυχε το αρχείο.');
          onAnswered();
          return;
        }
      }
      onAnswered();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-5 py-4 border-t border-black/5 bg-fluent-blue-50/50 space-y-2.5"
    >
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        placeholder="Η απάντησή σου…"
        className="w-full px-3 py-2 rounded-md border border-fluent-blue-200 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none resize-none"
        autoFocus
        maxLength={4000}
      />
      {pendingFile ? (
        <div className="bg-white border border-fluent-blue-200 rounded-md p-2 space-y-2">
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          Ακύρωση
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          icon={<Send20Regular className="h-4 w-4" />}
          disabled={pending}
        >
          {pending ? 'Αποστολή…' : 'Αποστολή απάντησης'}
        </Button>
      </div>
    </form>
  );
}

function FollowUpComposer({
  projectId,
  taskId,
  parentId,
  members,
  onCancel,
  onCreated,
}: {
  projectId: string;
  taskId: string;
  parentId: string;
  members: ProjectMemberOption[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [askedToId, setAskedToId] = useState<string>(members[0]?.id ?? '');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      fd.set('parentId', parentId);
      const res = await askTaskQuestion(projectId, taskId, fd);
      if (!res.ok) {
        setError(res.error ?? 'Σφάλμα.');
        return;
      }
      if (pendingFile && res.id) {
        const upload = new FormData();
        upload.set('file', pendingFile);
        if (fileTitle.trim()) upload.set('title', fileTitle.trim());
        const upRes = await uploadQuestionAttachment(projectId, res.id, 'question', upload);
        if (!upRes.ok) {
          setError(upRes.error ?? 'Δημιουργήθηκε η ερώτηση, αλλά απέτυχε το αρχείο.');
          onCreated();
          return;
        }
      }
      onCreated();
    });
  }

  const target = members.find((m) => m.id === askedToId);

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-fluent-blue-50 border border-fluent-blue-200 rounded-xl p-3 space-y-3"
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
          Συνέχεια της συζήτησης{target ? ` προς ${target.name || target.email}` : ''}
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="π.χ. Μπορείς να μου εξηγήσεις πιο αναλυτικά το X;"
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

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          Ακύρωση
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          icon={<Send20Regular className="h-4 w-4" />}
          disabled={pending}
        >
          {pending ? 'Αποστολή…' : 'Αποστολή ερώτησης'}
        </Button>
      </div>
    </form>
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
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', pendingFile);
      if (title.trim()) fd.set('title', title.trim());
      const res = await uploadQuestionAttachment(projectId, questionId, 'answer', fd);
      if (!res.ok) {
        setError(res.error ?? 'Σφάλμα.');
        return;
      }
      setPendingFile(null);
      setTitle('');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } finally {
      setUploading(false);
    }
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
      {error && <p className="text-[11px] text-red-700">{error}</p>}
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
          {uploading ? 'Μεταφόρτωση…' : 'Ανέβασμα'}
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
  attachments: QuestionAttachment[];
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
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a) => {
        const canRemove = a.uploadedById === currentUserId || isPrivileged;
        return (
          <li
            key={a.id}
            className="inline-flex items-center gap-2 text-xs rounded-md border border-fluent-neutral-20 bg-white px-2 py-1"
          >
            <FileIcon mimeType={a.mimeType} />
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-fluent-blue-700 hover:underline font-medium max-w-[200px]"
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

function formatDate(d: Date): string {
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('el-GR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function formatDuration(ms: number): string {
  if (ms < 60_000) return '< 1 λεπτό';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} λεπτό${min === 1 ? '' : 'ά'}`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} ώρ${hr === 1 ? 'α' : 'ες'}`;
  const days = Math.round(hr / 24);
  return `${days} ημέρ${days === 1 ? 'α' : 'ες'}`;
}

function computeAvgResponseMs(questions: QuestionListItem[]): number | null {
  const answered = questions.filter((q) => q.answeredAt);
  if (answered.length === 0) return null;
  const total = answered.reduce(
    (acc, q) => acc + ((q.answeredAt as Date).getTime() - q.createdAt.getTime()),
    0,
  );
  return Math.round(total / answered.length);
}
