/**
 * Ανέβασμα πρότασης και εκκίνηση της ανάλυσης.
 *
 * Route αντί για server action επειδή περνά αρχείο: ίδιος λόγος με τα
 * /api/upload/*-attachment. Το αρχείο πάει στο CDN σαν κανονικό συνημμένο του
 * έργου (εσωτερικό — οι προτάσεις έχουν τιμές), και το κείμενο κρατιέται στη
 * γραμμή της ανάλυσης ώστε μια νέα προσπάθεια να μη χρειάζεται ξανακατέβασμα.
 *
 * Δύο διαδρομές για το κείμενο:
 *   1. Ψηφιακό αρχείο → unpdf/mammoth, εδώ στον server.
 *   2. Σαρωμένο PDF → ο browser έχει ήδη μετατρέψει τις σελίδες σε εικόνες
 *      (lib/ocr/rasterize.ts) και τις στέλνει μαζί· εδώ περνούν από Gemini.
 *
 * Η rasterization μένει στον browser επίτηδες: στον server θα απαιτούσε native
 * εξαρτήσεις που σπάνε σε κάθε deploy.
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
  extractProposalText,
  isSupportedProposalFile,
} from '@/lib/proposals/extract'
import { ocrPagesToText } from '@/lib/ocr/read'
import { isGeminiConfigured } from '@/lib/ocr/gemini'
import { MAX_OCR_PAGES } from '@/lib/ocr/limits'
import { parseOcrPages } from '@/lib/ocr/payload'

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
  const ocrPages = parseOcrPages(formData.get('ocrPages'))
  const ocrTruncated = formData.get('ocrTruncated') === 'true'

  // Η εξαγωγή πρώτα: αν το αρχείο έχει κείμενο, το OCR είναι περιττό κόστος
  // ακόμη κι όταν ο browser έστειλε εικόνες.
  const extracted = await extractProposalText(buffer, mimeType, file.name)

  let text: string
  let ocrPageCount = 0
  let ocrModel: string | null = null
  let ocrWarning: string | null = null

  if (extracted.ok) {
    text = extracted.text
  } else if (extracted.reason !== 'no-text') {
    return NextResponse.json({ ok: false, error: extracted.message }, { status: 422 })
  } else if (ocrPages.length === 0) {
    const hint = isGeminiConfigured()
      ? 'Ανέβασε την πρόταση σε ψηφιακή μορφή, ή δοκίμασε ξανά ώστε να διαβαστεί με οπτική αναγνώριση.'
      : 'Η οπτική αναγνώριση δεν είναι ρυθμισμένη (λείπει το GEMINI_API_KEY).'
    return NextResponse.json({ ok: false, error: `${extracted.message} ${hint}` }, { status: 422 })
  } else {
    try {
      const ocr = await ocrPagesToText(ocrPages)
      text = ocr.text
      ocrPageCount = ocr.pagesRead
      ocrModel = ocr.model

      const notes: string[] = []
      if (ocr.failedPages.length > 0) {
        notes.push(`Δεν διαβάστηκαν οι σελίδες: ${ocr.failedPages.join(', ')}.`)
      }
      if (ocrTruncated) {
        notes.push(`Διαβάστηκαν μόνο οι πρώτες ${MAX_OCR_PAGES} σελίδες.`)
      }
      ocrWarning = notes.length > 0 ? notes.join(' ') : null
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `Η οπτική αναγνώριση απέτυχε: ${e instanceof Error ? e.message : 'unknown'}` },
        { status: 422 },
      )
    }
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
      ocrPageCount,
      ocrTruncated: ocrPageCount > 0 && ocrTruncated,
      ocrModel,
      ocrWarning,
    },
    select: { id: true },
  })

  void import('@/lib/proposals/analyze')
    .then((m) => m.runProposalAnalysis(analysis.id))
    .catch((err) => console.error('[proposals] η εκκίνηση ανάλυσης απέτυχε:', err))

  return NextResponse.json(
    { ok: true, analysisId: analysis.id, charCount: text.length, ocrPageCount },
    { status: 201 },
  )
}
