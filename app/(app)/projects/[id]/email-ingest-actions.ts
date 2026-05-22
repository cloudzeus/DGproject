'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getMessage, searchMessages } from '@/lib/graph-mail';
import { buildEmailTag, parseEmailTag } from '@/lib/email-tag';
import { analyzeProjectEmail, type EmailAnalysisResult } from '@/lib/llm/email-analysis';

async function requireProjectAccess(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('unauth');
  if (session.user.userType === 'customer') throw new Error('forbidden');
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      projectCode: true,
      members: { select: { userId: true } },
    },
  });
  if (!project) throw new Error('not_found');
  const role = session.user.role;
  const isPrivileged = role === 'admin' || role === 'manager';
  const isOwner = project.ownerId === session.user.id;
  const isMember = project.members.some((m) => m.userId === session.user.id);
  if (!isPrivileged && !isOwner && !isMember) throw new Error('forbidden');
  return { session, project };
}

export type InboxCandidate = {
  graphMessageId: string;
  conversationId: string;
  internetMessageId: string;
  subject: string;
  from: string;
  to: string[];
  receivedAt: string;
  preview: string;
  // True when this message is already in our EmailMessage table — UI greys it out.
  alreadyIngested: boolean;
};

// Searches the user's mailbox for messages tagged with this project's code
// (plus its conversation fallback) and returns candidates the user can pick
// for ingest. Messages we've already stored are flagged but still listed.
export async function searchProjectInbox(projectId: string): Promise<{
  ok: boolean;
  candidates?: InboxCandidate[];
  error?: string;
}> {
  let session, project;
  try {
    ({ session, project } = await requireProjectAccess(projectId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'access' };
  }
  if (!project.projectCode) return { ok: false, error: 'Το έργο δεν έχει project code.' };
  const conn = await prisma.userMailConnection.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!conn) return { ok: false, error: 'Δεν έχει συνδεθεί mailbox.' };

  // Two passes: tag match + conversationId fallback for replies that stripped
  // the tag. We dedupe by internetMessageId.
  const tagQuery = `FPM:p=${project.projectCode}`;
  let messages;
  try {
    messages = await searchMessages(session.user.id, tagQuery, { top: 50 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'graph_failed' };
  }

  // Fallback: pull existing conversationIds we already know for this project
  // and search them too — covers replies whose subject lost the tag.
  const knownConvIds = await prisma.emailMessage.findMany({
    where: { projectId, conversationId: { not: null } },
    select: { conversationId: true },
    distinct: ['conversationId'],
    take: 20,
  });
  // (Graph $search doesn't filter by conversationId; we'd need /me/messages?
  // $filter=conversationId eq '...' per id. Skip for now — tag match is the
  // primary path. Listed here as a TODO for the next iteration.)
  void knownConvIds;

  const existing = await prisma.emailMessage.findMany({
    where: { projectId, internetMessageId: { in: messages.map((m) => m.internetMessageId) } },
    select: { internetMessageId: true },
  });
  const existingSet = new Set(existing.map((e) => e.internetMessageId));

  const candidates: InboxCandidate[] = messages
    .filter((m) => {
      // Only include messages whose parsed tag matches THIS project (in case
      // search returns near-matches like FPM:p=PRJ-2026-001X).
      const tag = parseEmailTag(m.subject) ?? parseEmailTag(m.bodyPreview);
      return tag?.projectCode === project.projectCode;
    })
    .map((m) => ({
      graphMessageId: m.id,
      conversationId: m.conversationId,
      internetMessageId: m.internetMessageId,
      subject: m.subject,
      from: m.from?.emailAddress?.address ?? '',
      to: (m.toRecipients ?? []).map((r) => r.emailAddress.address),
      receivedAt: m.receivedDateTime,
      preview: (m.bodyPreview ?? '').slice(0, 280),
      alreadyIngested: existingSet.has(m.internetMessageId),
    }));

  return { ok: true, candidates };
}

export type AnalysisItem = {
  candidate: InboxCandidate;
  analysis: EmailAnalysisResult;
};

// Runs DeepSeek over each picked message and returns proposed actions. The
// frontend renders these for the user to approve/edit/reject. We do NOT
// touch tasks or write EmailMessage rows yet — that happens in applyIngest.
export async function analyzePicked(
  projectId: string,
  graphMessageIds: string[],
): Promise<{ ok: boolean; items?: AnalysisItem[]; error?: string }> {
  let session, project;
  try {
    ({ session, project } = await requireProjectAccess(projectId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'access' };
  }

  const openTasks = await prisma.task.findMany({
    where: { projectId, status: { in: ['backlog', 'todo', 'in_progress', 'review'] } },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assignees: { include: { user: { select: { name: true, email: true } } } },
    },
    take: 60,
  });
  const openTasksLite = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    assignees: t.assignees.map((a) => ({ name: a.user.name ?? a.user.email })),
  }));

  const items: AnalysisItem[] = [];
  for (const messageId of graphMessageIds) {
    try {
      const msg = await getMessage(session.user.id, messageId);
      const bodyText =
        msg.body?.content?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ??
        msg.bodyPreview ??
        '';
      const analysis = await analyzeProjectEmail({
        projectName: project.name,
        openTasks: openTasksLite,
        email: {
          subject: msg.subject,
          from: msg.from?.emailAddress?.address ?? '',
          to: (msg.toRecipients ?? []).map((r) => r.emailAddress.address),
          receivedAt: msg.receivedDateTime,
          body: bodyText,
        },
      });
      items.push({
        candidate: {
          graphMessageId: msg.id,
          conversationId: msg.conversationId,
          internetMessageId: msg.internetMessageId,
          subject: msg.subject,
          from: msg.from?.emailAddress?.address ?? '',
          to: (msg.toRecipients ?? []).map((r) => r.emailAddress.address),
          receivedAt: msg.receivedDateTime,
          preview: (msg.bodyPreview ?? bodyText).slice(0, 280),
          alreadyIngested: false,
        },
        analysis,
      });
    } catch (err) {
      // Surface per-message error inline so the user can still apply the rest.
      items.push({
        candidate: {
          graphMessageId: messageId,
          conversationId: '',
          internetMessageId: '',
          subject: '(αποτυχία ανάλυσης)',
          from: '',
          to: [],
          receivedAt: new Date().toISOString(),
          preview: err instanceof Error ? err.message : 'unknown',
          alreadyIngested: false,
        },
        analysis: {
          action: 'ignore',
          summary: err instanceof Error ? err.message : 'unknown error',
        },
      });
    }
  }

  return { ok: true, items };
}

export type ApplyDecision = {
  graphMessageId: string;
  // User's final decision — may differ from the LLM's suggestion.
  action: 'create_task' | 'update_task' | 'attach_only' | 'ignore';
  // For create_task
  newTask?: { title: string; description: string; priority: 'low' | 'medium' | 'high' | 'urgent'; dueDate: string | null };
  // For update_task
  targetTaskId?: string;
  appendNote?: string;
  // The original analysis result, kept for the EmailMessage.llmRaw audit.
  analysisRaw?: unknown;
};

// Persists the user-confirmed decisions. For each picked email we:
//   1) fetch the full message (we don't trust the client to ship the body)
//   2) create/update the task if requested
//   3) write the EmailMessage row tying it to project + (optional) task
export async function applyIngest(
  projectId: string,
  decisions: ApplyDecision[],
): Promise<{ ok: boolean; created?: number; updated?: number; attached?: number; error?: string }> {
  let session, project;
  try {
    ({ session, project } = await requireProjectAccess(projectId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'access' };
  }

  let created = 0;
  let updated = 0;
  let attached = 0;

  for (const d of decisions) {
    if (d.action === 'ignore') continue;
    let msg;
    try {
      msg = await getMessage(session.user.id, d.graphMessageId);
    } catch (err) {
      console.error('applyIngest fetch failed', err);
      continue;
    }

    // Dedupe by internetMessageId — if it's already there we skip.
    const existing = await prisma.emailMessage.findUnique({
      where: { internetMessageId: msg.internetMessageId },
      select: { id: true },
    });
    if (existing) continue;

    let taskId: string | null = null;

    if (d.action === 'create_task' && d.newTask) {
      const task = await prisma.task.create({
        data: {
          projectId,
          title: d.newTask.title.slice(0, 240),
          description: d.newTask.description,
          status: 'todo',
          priority: d.newTask.priority,
          dueDate: d.newTask.dueDate ? new Date(d.newTask.dueDate) : null,
          createdById: session.user.id,
        },
        select: { id: true },
      });
      taskId = task.id;
      created++;
    } else if (d.action === 'update_task' && d.targetTaskId) {
      // Append-only update: add a structured note to the description. We
      // never touch status/assignee from LLM output — too risky.
      const target = await prisma.task.findUnique({
        where: { id: d.targetTaskId },
        select: { id: true, description: true, projectId: true },
      });
      if (target && target.projectId === projectId) {
        const noteHeader = `\n\n— Από email ${new Date(msg.receivedDateTime).toLocaleString('el-GR')} (${msg.from?.emailAddress?.address ?? ''}):`;
        const note = d.appendNote ?? `Re: ${msg.subject}`;
        await prisma.task.update({
          where: { id: target.id },
          data: { description: `${target.description ?? ''}${noteHeader}\n${note}` },
        });
        taskId = target.id;
        updated++;
      }
    } else if (d.action === 'attach_only') {
      attached++;
    }

    await prisma.emailMessage.create({
      data: {
        graphMessageId: msg.id,
        internetMessageId: msg.internetMessageId,
        conversationId: msg.conversationId,
        direction: 'inbound',
        status: 'applied',
        projectId,
        taskId,
        userId: session.user.id,
        subject: msg.subject,
        fromAddress: msg.from?.emailAddress?.address ?? '',
        toAddresses: (msg.toRecipients ?? []).map((r) => r.emailAddress.address).join(', '),
        ccAddresses:
          msg.ccRecipients && msg.ccRecipients.length > 0
            ? msg.ccRecipients.map((r) => r.emailAddress.address).join(', ')
            : null,
        bodyHtml: msg.body?.content ?? null,
        bodyPreview: (msg.bodyPreview ?? '').slice(0, 500),
        receivedAt: new Date(msg.receivedDateTime),
        llmAction: d.action,
        llmRaw: (d.analysisRaw ?? undefined) as object | undefined,
        appliedNote: d.appendNote ?? null,
      },
    });
  }

  // Re-stamp the user's lastSyncedAt so the next inbox scan only needs deltas.
  await prisma.userMailConnection.update({
    where: { userId: session.user.id },
    data: { lastSyncedAt: new Date() },
  });

  revalidatePath(`/projects/${projectId}`);
  // Surface the tag we used so the UI can render a confirmation toast.
  void buildEmailTag(project.projectCode ?? '');
  return { ok: true, created, updated, attached };
}
