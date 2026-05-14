// Streaming upload endpoint for project-level attachments. See
// /api/upload/task-attachment for rationale.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN } from '@/lib/bunnycdn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

async function requireProjectEditor(projectId: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
  if (role === 'viewer') throw new Error('Forbidden');
  if (role === 'admin' || role === 'manager') return session.user.id;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error('Project not found');
  if (project.ownerId !== session.user.id) {
    const isMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: session.user.id } },
    });
    if (!isMember) throw new Error('Forbidden');
  }
  return session.user.id;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;

  let actorId: string;
  try {
    actorId = await requireProjectEditor(projectId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unauthorized';
    return NextResponse.json({ ok: false, error: msg }, { status: 403 });
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
  const title = String(formData.get('title') ?? '').trim() || null;
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Δεν επιλέχθηκε αρχείο.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const storedName = `${Date.now()}-${safeName}`;

  let uploadedUrl: string;
  try {
    const uploaded = await uploadFileToCDN({
      file: buffer,
      filename: storedName,
      folder: `projects/${projectId}`,
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

  const attachment = await prisma.attachment.create({
    data: {
      projectId,
      name: file.name,
      title,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      url: uploadedUrl,
      source: 'local',
      uploadedById: actorId,
    },
    select: { id: true, url: true, name: true, title: true, size: true, mimeType: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, attachment }, { status: 201 });
}
