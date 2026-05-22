import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ProjectDetail } from './project-detail';
import { MembersManager } from './members-manager';
import { ProjectActionsBar } from './project-actions-bar';
import type { ProjectFileItem } from './project-files';
import type { ProjectEmail } from './project-emails-tab';
import type { HistoryEntry } from './project-history-tab';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session, project, allUsers, taskAttachments, questionAttachments, meetings, regressionCount] = await Promise.all([
    auth(),
    prisma.project.findUnique({
      where: { id },
      include: {
        owner: true,
        members: { include: { user: true } },
        // Customer contact (User with userType=customer) — its email is the
        // default recipient for the "Νέο email" mailto launcher.
        // customerUserId can be null for internal projects.
        tasks: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            assignees: { include: { user: true } },
            attachments: {
              select: { id: true, name: true, title: true, size: true, mimeType: true, url: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
            },
            dependencies: {
              select: { dependsOnId: true },
            },
            questions: {
              orderBy: { createdAt: 'desc' },
              include: {
                askedBy: { select: { id: true, name: true, email: true, image: true } },
                askedTo: { select: { id: true, name: true, email: true, image: true } },
                attachments: {
                  orderBy: { createdAt: 'asc' },
                  select: {
                    id: true,
                    kind: true,
                    uploadedById: true,
                    name: true,
                    title: true,
                    size: true,
                    mimeType: true,
                    url: true,
                  },
                },
              },
            },
          },
        },
        attachments: {
          where: { taskId: null },
          orderBy: { createdAt: 'desc' },
          include: {
            uploadedBy: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.attachment.findMany({
      where: { task: { projectId: id }, taskId: { not: null } },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.taskQuestionAttachment.findMany({
      where: { question: { task: { projectId: id } } },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        question: {
          select: {
            id: true,
            question: true,
            answer: true,
            answeredAt: true,
            askedBy: { select: { name: true, email: true } },
            askedTo: { select: { name: true, email: true } },
            task: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.meetingNote.findMany({
      where: { projectId: id },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        subject: true,
        startedAt: true,
        endedAt: true,
        durationSec: true,
        summary: true,
        decisions: true,
        actionItems: true,
        risks: true,
        openQuestions: true,
        status: true,
        autoTasksCreated: true,
        autoTasksNeedReview: true,
        llmProvider: true,
        llmModel: true,
        llmDurationMs: true,
        teamsJoinUrl: true,
        transcriptVtt: true,
        processedAt: true,
        createdAt: true,
        organizer: { select: { id: true, name: true, email: true, image: true } },
        momDeliveries: {
          select: { id: true, status: true, recipientEmail: true, openedAt: true, deliveredAt: true },
        },
      },
    }),
    // Regressions: tasks that moved from review back to in_progress. Signal of
    // rework / quality issues — surfaced in the project Reports tab.
    // MySQL JSON paths use the `$.field` string format (Postgres would use ['field']).
    prisma.activity.count({
      where: {
        projectId: id,
        action: 'moved',
        AND: [
          { metadata: { path: '$.from', equals: 'review' } },
          { metadata: { path: '$.to', equals: 'in_progress' } },
        ],
      },
    }),
  ]);

  if (!project) notFound();

  // Look up the customer contact's email separately — Project.customerUserId
  // is just a foreign-key column with no Prisma relation, so we can't
  // include it. Skipped when the project has no linked customer.
  const customerEmail = project.customerUserId
    ? (await prisma.user.findUnique({
        where: { id: project.customerUserId },
        select: { email: true },
      }))?.email ?? null
    : null;

  const role = session?.user?.role;
  const sessionUserId = session?.user?.id ?? '';
  const isPrivileged = role === 'admin' || role === 'manager';
  const isCustomer = session?.user?.userType === 'customer';

  // Costing data fetched only for admin/manager — viewers/members never see
  // the tab and never get the catalog payload (which can be large).
  const costLinesRaw = isPrivileged
    ? await prisma.projectCostLine.findMany({
        where: { projectId: id },
        orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
        include: {
          item: { select: { code: true, name: true, unitName: true } },
          createdBy: { select: { name: true, email: true } },
        },
      })
    : [];
  const catalogItems = isPrivileged
    ? await prisma.softoneItem.findMany({
        where: { isActive: true },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        select: {
          mtrl: true,
          code: true,
          name: true,
          unitPrice: true,
          vatRate: true,
          unitName: true,
          groupName: true,
          kind: true,
        },
      })
    : [];

  // Members + viewers (clients) may only access projects where they are the owner or an
  // explicit member. Show 404 (not 403) so we don't leak existence of foreign projects.
  if (!isPrivileged) {
    const isOwner = project.ownerId === sessionUserId;
    const isMember = project.members.some((m) => m.userId === sessionUserId);
    if (!isOwner && !isMember) notFound();
  }

  const canEdit =
    role === 'admin' || role === 'manager' || sessionUserId === project.ownerId;

  const projectMemberOptions = project.members.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? '',
    email: m.user.email,
  }));

  // Project participants for Q&A: members + owner (deduped)
  const questionMembersMap = new Map<string, { id: string; name: string; email: string; avatarUrl?: string }>();
  for (const m of project.members) {
    questionMembersMap.set(m.user.id, {
      id: m.user.id,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
      avatarUrl: m.user.image ?? undefined,
    });
  }
  if (project.owner) {
    questionMembersMap.set(project.owner.id, {
      id: project.owner.id,
      name: project.owner.name ?? project.owner.email,
      email: project.owner.email,
      avatarUrl: project.owner.image ?? undefined,
    });
  }
  const questionMembers = Array.from(questionMembersMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'el'),
  );

  const currentUserId = sessionUserId;

  const normalized = {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    status: project.status,
    dueDate: project.dueDate,
    projectCode: project.projectCode,
    customerEmail,
    members: project.members.map((m) => ({
      name: m.user.name ?? m.user.email,
      avatarUrl: m.user.image ?? undefined,
    })),
    tasks: project.tasks.map((t) => {
      // For customer users, redact tasks they're not assigned to: only title and
      // status are visible — no description, dates, assignees, attachments, or
      // questions. Assigned tasks pass through with full detail so they can act
      // on their own work and answer questions.
      const isAssignedToMe = isCustomer && t.assignees.some((a) => a.user.id === sessionUserId);
      if (isCustomer && !isAssignedToMe) {
        return {
          id: t.id,
          title: t.title,
          description: null,
          status: t.status,
          priority: t.priority,
          startDate: null,
          dueDate: null,
          estimatedHours: null,
          completedAt: null,
          addToCalendar: false,
          addToTeams: false,
          inProgressStartedAt: null,
          inProgressAccumulatedMs: 0,
          dependencyIds: [] as string[],
          assignees: [] as { id: string; name: string; avatarUrl?: string }[],
          attachments: [] as never[],
          questions: [] as never[],
          _redacted: true as const,
        };
      }
      return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      startDate: t.startDate,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      completedAt: t.completedAt,
      addToCalendar: t.addToCalendar,
      addToTeams: t.addToTeams,
      inProgressStartedAt: t.inProgressStartedAt,
      // BigInt is non-serializable across the RSC boundary — convert to a
      // plain number. Safe up to ~285k years of accumulated time.
      inProgressAccumulatedMs: Number(t.inProgressAccumulatedMs),
      dependencyIds: t.dependencies.map((d) => d.dependsOnId),
      assignees: t.assignees.map((a) => ({
        id: a.user.id,
        name: a.user.name ?? a.user.email,
        avatarUrl: a.user.image ?? undefined,
      })),
      attachments: t.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        title: a.title,
        size: a.size,
        mimeType: a.mimeType,
        url: a.url,
        createdAt: a.createdAt,
      })),
      questions: t.questions.map((q) => ({
        id: q.id,
        parentId: q.parentId,
        question: q.question,
        answer: q.answer,
        answeredAt: q.answeredAt,
        createdAt: q.createdAt,
        askedBy: {
          id: q.askedBy.id,
          name: q.askedBy.name ?? q.askedBy.email,
          email: q.askedBy.email,
          avatarUrl: q.askedBy.image ?? undefined,
        },
        askedTo: {
          id: q.askedTo.id,
          name: q.askedTo.name ?? q.askedTo.email,
          email: q.askedTo.email,
          avatarUrl: q.askedTo.image ?? undefined,
        },
        attachments: q.attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          uploadedById: a.uploadedById,
          name: a.name,
          title: a.title,
          size: a.size,
          mimeType: a.mimeType,
          url: a.url,
        })),
      })),
      };
    }),
  };

  const projectAttachments = project.attachments.map((a) => ({
    id: a.id,
    name: a.name,
    title: a.title,
    size: a.size,
    mimeType: a.mimeType,
    url: a.url,
    uploadedByName: a.uploadedBy.name ?? a.uploadedBy.email,
  }));

  // Aggregate every file attached to the project — at the project level, on a task,
  // or as part of a question/answer thread — into a single browse list.
  const aggregatedFiles: ProjectFileItem[] = [
    ...project.attachments.map((a) => ({
      id: `proj-${a.id}`,
      kind: 'project' as const,
      name: a.name,
      title: a.title,
      size: a.size,
      mimeType: a.mimeType,
      url: a.url,
      createdAt: a.createdAt,
      uploadedByName: a.uploadedBy.name ?? a.uploadedBy.email,
      context: null,
    })),
    ...taskAttachments.map((a) => ({
      id: `task-${a.id}`,
      kind: 'task' as const,
      name: a.name,
      title: a.title,
      size: a.size,
      mimeType: a.mimeType,
      url: a.url,
      createdAt: a.createdAt,
      uploadedByName: a.uploadedBy.name ?? a.uploadedBy.email,
      context: a.task
        ? {
            taskId: a.task.id,
            taskTitle: a.task.title,
          }
        : null,
    })),
    ...questionAttachments.map((a) => ({
      id: `q-${a.id}`,
      kind: 'question' as const,
      questionKind: a.kind, // 'question' | 'answer'
      name: a.name,
      title: a.title,
      size: a.size,
      mimeType: a.mimeType,
      url: a.url,
      createdAt: a.createdAt,
      uploadedByName: a.uploadedBy.name ?? a.uploadedBy.email,
      context: {
        taskId: a.question.task.id,
        taskTitle: a.question.task.title,
        questionPreview: a.question.question,
        answerPreview: a.question.answer,
        askedByName: a.question.askedBy.name ?? a.question.askedBy.email,
        askedToName: a.question.askedTo.name ?? a.question.askedTo.email,
        answeredAt: a.question.answeredAt,
      },
    })),
  ].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());

  const memberUsers = project.members.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? '',
    email: m.user.email,
    image: m.user.image,
    role: m.user.role,
  }));

  const userOptions = allUsers.map((u) => ({ id: u.id, name: u.name ?? '', email: u.email }));

  // Normalize meetings for the new "Συναντήσεις" tab. We keep the raw Json
  // arrays (decisions/actionItems/risks/openQuestions) as the inner type since
  // they were stored by the LLM pipeline and the tab only counts/displays them.
  // Customers do not see the meetings tab at all (we have no attendee model to
  // tell which meetings they actually joined), so skip serializing the payload.
  const meetingsForClient = isCustomer ? [] : meetings.map((m) => ({
    id: m.id,
    subject: m.subject,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    durationSec: m.durationSec,
    summary: m.summary,
    decisions: m.decisions as unknown[] | null,
    actionItems: m.actionItems as unknown[] | null,
    risks: m.risks as unknown[] | null,
    openQuestions: m.openQuestions as unknown[] | null,
    status: m.status,
    autoTasksCreated: m.autoTasksCreated,
    autoTasksNeedReview: m.autoTasksNeedReview,
    llmProvider: m.llmProvider,
    llmModel: m.llmModel,
    llmDurationMs: m.llmDurationMs,
    teamsJoinUrl: m.teamsJoinUrl,
    hasTranscript: !!m.transcriptVtt && m.transcriptVtt.length > 0,
    processedAt: m.processedAt,
    createdAt: m.createdAt,
    organizer: {
      id: m.organizer.id,
      name: m.organizer.name ?? m.organizer.email,
      email: m.organizer.email,
      avatarUrl: m.organizer.image ?? undefined,
    },
    momDeliveries: m.momDeliveries.map((d) => ({
      id: d.id,
      status: d.status,
      recipientEmail: d.recipientEmail,
      openedAt: d.openedAt,
      deliveredAt: d.deliveredAt,
    })),
  }));

  const costLines = costLinesRaw.map((l) => ({
    id: l.id,
    softoneItemMtrl: l.softoneItemMtrl,
    kind: l.kind,
    quantity: l.quantity,
    unitPriceSnapshot: l.unitPriceSnapshot,
    vatRateSnapshot: l.vatRateSnapshot,
    notes: l.notes,
    itemCode: l.item.code,
    itemName: l.item.name,
    itemUnitName: l.item.unitName,
    createdByName: l.createdBy.name ?? l.createdBy.email,
    createdAt: l.createdAt,
  }));

  // ─── Email tab + Communication history ─────────────────────────────────
  // Customers don't see either tab, so we skip the work for them.
  const [emailRows, activityRows, taskQuestionRows, meetingRowsForHistory, memberRowsForHistory, costLinesForHistory] = isCustomer
    ? [[], [], [], [], [], []]
    : await Promise.all([
        prisma.emailMessage.findMany({
          where: { projectId: id },
          orderBy: [{ receivedAt: 'desc' }, { sentAt: 'desc' }],
          include: { task: { select: { id: true, title: true } } },
          take: 200,
        }),
        prisma.activity.findMany({
          where: { projectId: id },
          orderBy: { createdAt: 'desc' },
          include: {
            actor: { select: { id: true, name: true, email: true, image: true } },
            task: { select: { id: true, title: true } },
          },
          take: 200,
        }),
        prisma.taskQuestion.findMany({
          where: { task: { projectId: id } },
          orderBy: { createdAt: 'desc' },
          include: {
            askedBy: { select: { id: true, name: true, email: true, image: true } },
            askedTo: { select: { id: true, name: true, email: true, image: true } },
            task: { select: { id: true, title: true } },
          },
          take: 100,
        }),
        prisma.meetingNote.findMany({
          where: { projectId: id },
          orderBy: { startedAt: 'desc' },
          select: {
            id: true,
            subject: true,
            startedAt: true,
            durationSec: true,
            summary: true,
            organizer: { select: { id: true, name: true, email: true, image: true } },
          },
          take: 100,
        }),
        prisma.projectMember.findMany({
          where: { projectId: id },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        }),
        prisma.projectCostLine.findMany({
          where: { projectId: id },
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: { select: { id: true, name: true, email: true, image: true } },
            item: { select: { name: true } },
          },
          take: 100,
        }),
      ]);

  const emails: ProjectEmail[] = emailRows.map((e) => ({
    id: e.id,
    direction: e.direction,
    status: e.status,
    subject: e.subject,
    fromAddress: e.fromAddress,
    toAddresses: e.toAddresses,
    bodyPreview: e.bodyPreview,
    receivedAt: e.receivedAt,
    sentAt: e.sentAt,
    conversationId: e.conversationId,
    llmAction: e.llmAction,
    taskId: e.taskId,
    taskTitle: e.task?.title ?? null,
  }));

  // Unified activity timeline. Builds one HistoryEntry per source row so the
  // tab can render a single sorted/grouped list. Order matters less than the
  // identifying `kind` — the client sorts by `at` per day-group.
  const historyEntries: HistoryEntry[] = [
    ...activityRows
      .filter((a) => a.task) // only task-scoped activity is meaningful in the timeline
      .map<HistoryEntry>((a) => ({
        kind: 'task',
        id: a.id,
        at: a.createdAt,
        actor: { id: a.actor.id, name: a.actor.name ?? a.actor.email, avatarUrl: a.actor.image ?? undefined },
        action: a.action,
        taskTitle: a.task!.title,
        taskId: a.task!.id,
        // metadata can have { from, to, field, comment } etc.; surface as raw text
        detail:
          a.metadata && typeof a.metadata === 'object'
            ? JSON.stringify(a.metadata, null, 2)
            : null,
      })),
    ...emailRows.map<HistoryEntry>((e) => ({
      kind: 'email',
      id: e.id,
      at: (e.receivedAt ?? e.sentAt ?? e.ingestedAt) as Date,
      actor: {
        name: e.direction === 'outbound' ? e.fromAddress : e.fromAddress,
      },
      direction: e.direction,
      subject: e.subject,
      from: e.fromAddress,
      to: e.toAddresses,
      preview: e.bodyPreview,
      llmAction: e.llmAction,
      taskTitle: e.task?.title ?? null,
    })),
    ...taskQuestionRows.map<HistoryEntry>((q) => ({
      kind: 'question',
      id: q.id,
      at: q.createdAt,
      actor: { id: q.askedBy.id, name: q.askedBy.name ?? q.askedBy.email, avatarUrl: q.askedBy.image ?? undefined },
      taskTitle: q.task.title,
      question: q.question,
      askedToName: q.askedTo.name ?? q.askedTo.email,
      answer: q.answer,
      answeredAt: q.answeredAt,
    })),
    ...meetingRowsForHistory.map<HistoryEntry>((m) => ({
      kind: 'meeting',
      id: m.id,
      at: m.startedAt,
      actor: { id: m.organizer.id, name: m.organizer.name ?? m.organizer.email, avatarUrl: m.organizer.image ?? undefined },
      subject: m.subject,
      summary: m.summary,
      durationSec: m.durationSec,
    })),
    ...memberRowsForHistory.map<HistoryEntry>((m) => ({
      kind: 'member',
      id: m.id,
      at: m.createdAt,
      actor: { id: m.user.id, name: m.user.name ?? m.user.email, avatarUrl: m.user.image ?? undefined },
      memberName: m.user.name ?? m.user.email,
      memberRole: m.role,
    })),
    ...costLinesForHistory.map<HistoryEntry>((c) => ({
      kind: 'cost',
      id: c.id,
      at: c.createdAt,
      actor: {
        id: c.createdBy.id,
        name: c.createdBy.name ?? c.createdBy.email,
        avatarUrl: c.createdBy.image ?? undefined,
      },
      itemName: c.item.name,
      quantity: c.quantity,
      amount: c.quantity * c.unitPriceSnapshot,
    })),
  ];

  const catalogProducts = catalogItems
    .filter((i) => i.kind === 'product')
    .map((i) => ({
      mtrl: i.mtrl,
      code: i.code,
      name: i.name,
      unitPrice: i.unitPrice,
      vatRate: i.vatRate,
      unitName: i.unitName,
      groupName: i.groupName,
      kind: i.kind,
    }));
  const catalogServices = catalogItems
    .filter((i) => i.kind === 'service')
    .map((i) => ({
      mtrl: i.mtrl,
      code: i.code,
      name: i.name,
      unitPrice: i.unitPrice,
      vatRate: i.vatRate,
      unitName: i.unitName,
      groupName: i.groupName,
      kind: i.kind,
    }));

  return (
    <>
      <ProjectDetail
        project={normalized}
        projectMembers={projectMemberOptions}
        questionMembers={questionMembers}
        currentUserId={currentUserId}
        isPrivileged={isPrivileged}
        isCustomer={isCustomer}
        canEdit={canEdit}
        projectAttachments={projectAttachments}
        aggregatedFiles={aggregatedFiles}
        meetings={meetingsForClient}
        regressionCount={regressionCount}
        costLines={costLines}
        catalogProducts={catalogProducts}
        catalogServices={catalogServices}
        emails={emails}
        historyEntries={historyEntries}
      />
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-4">
        <div className="flex items-center justify-end">
          <ProjectActionsBar
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
              color: project.color,
              status: project.status,
              dueDate: project.dueDate,
              ownerId: project.ownerId,
              memberIds: project.members.map((m) => m.userId),
            }}
            users={userOptions}
            canEdit={canEdit}
            sessionEmail={session?.user?.email ?? ''}
          />
        </div>
        <MembersManager
          projectId={project.id}
          canEdit={canEdit}
          ownerId={project.ownerId}
          members={memberUsers}
          allUsers={allUsers.map((u) => ({
            id: u.id,
            name: u.name ?? '',
            email: u.email,
            image: u.image,
            role: u.role,
          }))}
        />
      </div>
    </>
  );
}
