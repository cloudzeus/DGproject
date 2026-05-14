import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ProjectDetail } from './project-detail';
import { MembersManager } from './members-manager';
import { ProjectActionsBar } from './project-actions-bar';
import type { ProjectFileItem } from './project-files';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session, project, allUsers, taskAttachments, questionAttachments, meetings, regressionCount] = await Promise.all([
    auth(),
    prisma.project.findUnique({
      where: { id },
      include: {
        owner: true,
        members: { include: { user: true } },
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

  const role = session?.user?.role;
  const sessionUserId = session?.user?.id ?? '';
  const isPrivileged = role === 'admin' || role === 'manager';

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
    members: project.members.map((m) => ({
      name: m.user.name ?? m.user.email,
      avatarUrl: m.user.image ?? undefined,
    })),
    tasks: project.tasks.map((t) => ({
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
    })),
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
  const meetingsForClient = meetings.map((m) => ({
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

  return (
    <>
      <ProjectDetail
        project={normalized}
        projectMembers={projectMemberOptions}
        questionMembers={questionMembers}
        currentUserId={currentUserId}
        isPrivileged={isPrivileged}
        canEdit={canEdit}
        projectAttachments={projectAttachments}
        aggregatedFiles={aggregatedFiles}
        meetings={meetingsForClient}
        regressionCount={regressionCount}
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
