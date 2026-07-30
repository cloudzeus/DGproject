/**
 * Ανέβασμα πρότασης και εκκίνηση της ανάλυσης.
 *
 * Route αντί για server action επειδή περνά αρχείο: ίδιος λόγος με τα
 * /api/upload/*-attachment. Το αρχείο πάει στο CDN σαν κανονικό συνημμένο του
 * έργου (εσωτερικό — οι προτάσεις έχουν τιμές), και το κείμενο κρατιέται στη
 * γραμμή της ανάλυσης ώστε μια νέα προσπάθεια να μη χρειάζεται ξανακατέβασμα.
 *
 * Η ανάλυση ξεκινά fire-and-forget: το ανέβασμα δεν περιμένει 50 σελίδες
 * DeepSeek. Ό,τι πεθάνει μαζί με τη διεργασία το ξαναπιάνει ο sweeper.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { uploadFileToCDN } from '@/lib/bunnycdn'
import {
  MAX_FILE_BYTES,
  ProposalExtractionError,
  extractProposalText,
  isSupportedProposalFile,
} from '@/lib/proposals/extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Ίδια πύλη με την Κοστολόγηση: η πρόταση περιέχει τιμές. */
async function requirePrivileged(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const role = session.user.role
  if (role !== 'admin' && role !== 'manager') throw new Error('Forbidden')
  return session.user.id
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params

  let actorId: string
  try {
    actorId = await requirePrivileged()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unauthorized'
    return NextResponse.json({ ok: false, error: msg }, { status: 403 })
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) {
    return NextResponse.json({ ok: false, error: 'Το έργο δεν βρέθηκε.' }, { status: 404 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Αποτυχία ανάγνωσης του αρχείου: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Δεν επιλέχθηκε αρχείο.' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Το αρχείο υπερβαίνει τα ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    )
  }
  const mimeType = file.type || 'application/octet-stream'
  if (!isSupportedProposalFile(mimeType, file.name)) {
    return NextResponse.json(
      { ok: false, error: 'Δεκτά είναι μόνο αρχεία PDF και DOCX.' },
      { status: 415 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Η εξαγωγή πρώτα: αν το PDF είναι σαρωμένο, ο χρήστης το μαθαίνει αμέσως
  // αντί να δει μια ανάλυση που «τρέχει» και αποτυγχάνει σε ένα λεπτό.
  let text: string
  try {
    const extracted = await extractProposalText(buffer, mimeType, file.name)
    text = extracted.text
  } catch (e) {
    const msg = e instanceof ProposalExtractionError ? e.message : 'Η ανάγνωση του αρχείου απέτυχε.'
    return NextResponse.json({ ok: false, error: msg }, { status: 422 })
  }

  let attachmentId: string | null = null
  try {
    const uploaded = await uploadFileToCDN({
      file: buffer,
      filename: `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`,
      folder: `projects/${projectId}`,
      contentType: mimeType,
    })
    const attachment = await prisma.attachment.create({
      data: {
        projectId,
        name: file.name,
        title: 'Πρόταση έργου',
        size: file.size,
        mimeType,
        url: uploaded.url,
        source: 'local',
        uploadedById: actorId,
      },
      select: { id: true },
    })
    attachmentId = attachment.id
  } catch (e) {
    // Το CDN δεν είναι προϋπόθεση της ανάλυσης: το κείμενο το έχουμε ήδη.
    console.error('[proposals] η αποθήκευση του αρχείου απέτυχε:', e)
  }

  const analysis = await prisma.proposalAnalysis.create({
    data: {
      projectId,
      attachmentId,
      fileName: file.name,
      mimeType,
      extractedText: text,
      charCount: text.length,
      status: 'pending',
      createdById: actorId,
    },
    select: { id: true },
  })

  void import('@/lib/proposals/analyze')
    .then((m) => m.runProposalAnalysis(analysis.id))
    .catch((err) => console.error('[proposals] η εκκίνηση ανάλυσης απέτυχε:', err))

  return NextResponse.json({ ok: true, analysisId: analysis.id, charCount: text.length }, { status: 201 })
}
