import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { uploadFileToCDN } from '@/lib/bunnycdn'
import { MAX_FILE_BYTES, extractProposalText, isSupportedProposalFile } from '@/lib/proposals/extract'
import { canUploadProjectContract } from '@/lib/contracts/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params
  const session = await auth()
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } })
  if (!project) return NextResponse.json({ ok: false, error: 'Το έργο δεν βρέθηκε.' }, { status: 404 })
  if (!session?.user?.id || !canUploadProjectContract({
    id: session.user.id,
    role: session.user.role,
    userType: session.user.userType ?? '',
  }, project.ownerId)) {
    return NextResponse.json({ ok: false, error: 'Μόνο ο δημιουργός του έργου μπορεί να ανεβάσει τη σύμβαση.' }, { status: 403 })
  }

  let form: FormData
  try { form = await request.formData() } catch {
    return NextResponse.json({ ok: false, error: 'Το αρχείο δεν διαβάστηκε.' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: 'Δεν επιλέχθηκε αρχείο.' }, { status: 400 })
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: 'Το αρχείο υπερβαίνει τα 20 MB.' }, { status: 413 })
  const mimeType = file.type || 'application/octet-stream'
  if (!isSupportedProposalFile(mimeType, file.name)) return NextResponse.json({ ok: false, error: 'Δεκτά είναι μόνο PDF και DOCX.' }, { status: 415 })
  const bytes = Buffer.from(await file.arrayBuffer())
  const extracted = await extractProposalText(bytes, mimeType, file.name)
  if (!extracted.ok) return NextResponse.json({ ok: false, error: `${extracted.message} Χρησιμοποίησε αρχείο με επιλέξιμο κείμενο.` }, { status: 422 })

  let attachmentId: string | null = null
  try {
    const uploaded = await uploadFileToCDN({
      file: bytes,
      filename: `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`,
      folder: `projects/${projectId}/contract`,
      contentType: mimeType,
    })
    const attachment = await prisma.attachment.create({
      data: { projectId, name: file.name, title: 'Σύμβαση έργου', size: file.size, mimeType, url: uploaded.url, source: 'local', visibility: 'internal', uploadedById: session.user.id },
      select: { id: true },
    })
    attachmentId = attachment.id
  } catch (error) {
    console.error('[contract] attachment upload failed:', error)
    return NextResponse.json({ ok: false, error: 'Το αρχείο δεν αποθηκεύτηκε. Δοκίμασε ξανά.' }, { status: 502 })
  }

  const contract = await prisma.$transaction(async (tx) => {
    await tx.taskContractCheck.deleteMany({ where: { contract: { projectId } } })
    return tx.projectContract.upsert({
      where: { projectId },
      create: { projectId, attachmentId, fileName: file.name, mimeType, extractedText: extracted.text, charCount: extracted.text.length, uploadedById: session.user.id },
      update: { attachmentId, fileName: file.name, mimeType, extractedText: extracted.text, charCount: extracted.text.length, uploadedById: session.user.id },
      select: { id: true },
    })
  })
  return NextResponse.json({ ok: true, contractId: contract.id, charCount: extracted.text.length }, { status: 201 })
}
