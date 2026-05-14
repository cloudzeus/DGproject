// Streaming upload endpoint for Q&A attachments (kind=question or answer).
// See /api/upload/task-attachment for the general rationale.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN } from '@/lib/bunnycdn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const role = session.user.role;
  const isPrivileged = role === 'admin' || role === 'manager';

  const question = await prisma.taskQuestion.findUnique({
    where: { id: questionId },
    select: {
      askedById: true,
      askedToId: true,
      answer: true,
      task: { select: { projectId: true } },
    },
  });
  if (!question) {
    return NextResponse.json({ ok: false, error: 'Η ερώτηση δεν βρέθηκε.' }, { status: 404 });
  }

  // Same access check as the existing project pages: must be a project member
  // or owner, or an admin/manager.
  const projectId = question.task.projectId;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) {
    return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
  }
  if (!isPrivileged && project.ownerId !== userId) {
    const isMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!isMember) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `Αποτυχία ανάγνωσης του αρχείου: ${e instanceof Error ? e.message : 'unknown'}`,
      },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  const kindRaw = String(formData.get('kind') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim() || null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Δεν επιλέχθηκε αρχείο.' }, { status: 400 });
  }
  if (kindRaw !== 'question' && kindRaw !== 'answer') {
    return NextResponse.json({ ok: false, error: 'Μη έγκυρος τύπος συνημμένου.' }, { status: 400 });
  }
  const kind = kindRaw as 'question' | 'answer';

  // Stricter authoring rules per kind: only the asker can attach to the
  // question body, only the askee/privileged user can attach to the answer.
  if (kind === 'question' && question.askedById !== userId && !isPrivileged) {
    return NextResponse.json(
      { ok: false, error: 'Μόνο ο συντάκτης μπορεί να επισυνάψει στην ερώτηση.' },
      { status: 403 },
    );
  }
  if (kind === 'answer' && question.askedToId !== userId && !isPrivileged) {
    return NextResponse.json(
      { ok: false, error: 'Μόνο ο παραλήπτης μπορεί να επισυνάψει στην απάντηση.' },
      { status: 403 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const storedName = `${Date.now()}-${safeName}`;

  let uploadedUrl: string;
  try {
    const uploaded = await uploadFileToCDN({
      file: buffer,
      filename: storedName,
      folder: `questions/${questionId}/${kind}`,
      contentType: file.type || 'application/octet-stream',
    });
    uploadedUrl = uploaded.url;
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `Αποτυχία μεταφόρτωσης στο CDN: ${e instanceof Error ? e.message : 'unknown'}`,
      },
      { status: 502 },
    );
  }

  const attachment = await prisma.taskQuestionAttachment.create({
    data: {
      questionId,
      uploadedById: userId,
      kind,
      name: file.name,
      title,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      url: uploadedUrl,
    },
    select: { id: true, url: true, name: true, title: true, size: true, mimeType: true, kind: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, attachment }, { status: 201 });
}
