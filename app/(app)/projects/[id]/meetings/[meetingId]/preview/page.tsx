import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { MomFullPreview } from './mom-full-preview';

type Decision = { text: string; timestampSec: number; participantEmails: string[] };
type ActionItem = {
  title: string;
  description: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  confidence: number;
  sourceQuote: string;
  sourceTimestampSec: number;
};
type Risk = { text: string; severity: 'low' | 'medium' | 'high'; ownerEmail: string | null };
type OpenQuestion = { question: string; askedToEmail: string | null; askedByEmail: string | null };

export default async function MomPreviewPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const { id: projectId, meetingId } = await params;
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const meeting = await prisma.meetingNote.findUnique({
    where: { id: meetingId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          owner: { select: { name: true, email: true } },
          members: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  if (!meeting || meeting.projectId !== projectId) notFound();

  const decisions = (meeting.decisions as Prisma.JsonValue as Decision[] | null) ?? [];
  const actionItems = (meeting.actionItems as Prisma.JsonValue as ActionItem[] | null) ?? [];
  const risks = (meeting.risks as Prisma.JsonValue as Risk[] | null) ?? [];
  const openQuestions = (meeting.openQuestions as Prisma.JsonValue as OpenQuestion[] | null) ?? [];

  const seen = new Set<string>();
  const suggestedRecipients = [
    { email: meeting.project.owner.email, name: meeting.project.owner.name },
    ...meeting.project.members.map((m) => ({ email: m.user.email, name: m.user.name })),
  ].filter((r) => {
    if (seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });

  return (
    <MomFullPreview
      meetingId={meeting.id}
      projectId={projectId}
      meetingSubject={meeting.subject}
      suggestedRecipients={suggestedRecipients}
      insights={{
        summary: meeting.summary,
        decisions: decisions.map((d) => ({ text: d.text, timestampSec: d.timestampSec })),
        actionItems: actionItems.map((a) => ({
          title: a.title,
          assigneeEmail: a.assigneeEmail,
          priority: a.priority,
          confidence: a.confidence,
        })),
        risks: risks.map((r) => ({ text: r.text, severity: r.severity })),
        openQuestions: openQuestions.map((q) => ({ question: q.question })),
      }}
    />
  );
}
