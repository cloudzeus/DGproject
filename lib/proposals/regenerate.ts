/**
 * «Δεν το κατάλαβε σωστά — ξαναφτιάξ' το με αυτή τη διευκρίνιση.»
 *
 * Το μοντέλο διαβάζει την πρόταση μία φορά, χωρίς να ξέρει τίποτα από όσα
 * ξέρει ο υπεύθυνος του έργου. Η διόρθωση με το χέρι αρκεί όταν το λάθος είναι
 * μια λέξη· δεν αρκεί όταν το λάθος είναι δομικό — «αυτό δεν είναι ένα βήμα,
 * είναι τρία» ή «εδώ εννοεί τον δικό μας εξοπλισμό, όχι του πελάτη».
 *
 * Γι' αυτό η επαναδημιουργία επιστρέφει **ένα ή περισσότερα** αντικείμενα. Το
 * αρχικό δεν σβήνεται: μένει σε `replaced` ώστε να απαντηθεί αργότερα το
 * «γιατί αυτό το βήμα δεν μοιάζει με την πρόταση;».
 */

import { prisma } from '@/lib/prisma'
import { maskProposalPII, buildNameMap, pseudonymizeNames, restoreNames } from './mask'
import { parseChunkExtraction } from './parse'
import { buildRegeneratePrompt } from './prompt'
import { callProposalLlm } from './llm'
import type { ProposalProjectContext } from './types'

/** Πόσο κείμενο γύρω από το απόσπασμα στέλνουμε ως πλαίσιο. */
export const CONTEXT_RADIUS = 4_000

/**
 * Βρίσκει το κομμάτι της πρότασης γύρω από το απόσπασμα.
 *
 * Αν το απόσπασμα δεν βρεθεί — γίνεται, όταν το μοντέλο το παρέφρασε ελαφρά ή
 * όταν το κείμενο ήρθε από OCR — γυρνάμε την αρχή του εγγράφου. Εκεί βρίσκεται
 * σχεδόν πάντα το αντικείμενο του έργου, οπότε είναι το καλύτερο πλαίσιο που
 * μπορούμε να δώσουμε χωρίς να μαντέψουμε.
 *
 * Καθαρή συνάρτηση.
 */
export function findQuoteWindow(text: string, quote: string | null, radius = CONTEXT_RADIUS): string {
  if (text.length <= radius * 2) return text

  const at = quote && quote.length > 20 ? text.indexOf(quote.slice(0, 120)) : -1
  if (at === -1) return text.slice(0, radius * 2)

  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + quote!.length + radius)
  return text.slice(start, end)
}

export type RegenerateResult = {
  created: number
  titles: string[]
}

export async function regenerateProposalItem(args: {
  itemId: string
  clarification: string
  /**
   * Η κλήση προς το μοντέλο, ως παράμετρος — ώστε να ελέγχεται χωρίς δίκτυο
   * ότι το αρχικό σημαδεύεται σωστά, ότι τα παιδιά δείχνουν πίσω σε αυτό, και
   * ότι η ανάθεση επιβιώνει. Αυτά είναι τα σημεία που σπάνε σιωπηλά.
   */
  call?: typeof callProposalLlm
}): Promise<RegenerateResult> {
  const clarification = args.clarification.trim()
  if (clarification.length < 5) throw new Error('Γράψε λίγο πιο αναλυτικά τι θέλεις να αλλάξει.')

  const item = await prisma.proposalItem.findUnique({
    where: { id: args.itemId },
    include: {
      analysis: {
        select: {
          id: true,
          extractedText: true,
          project: {
            select: {
              name: true,
              description: true,
              startDate: true,
              dueDate: true,
              primaryCompany: { select: { NAME: true } },
              companies: { select: { company: { select: { NAME: true } } } },
            },
          },
        },
      },
    },
  })
  if (!item) throw new Error('Το αντικείμενο δεν βρέθηκε.')
  if (item.status === 'converted') {
    throw new Error('Έχει ήδη γίνει εργασία — άλλαξέ την από το board.')
  }
  if (item.status === 'replaced') {
    throw new Error('Έχει ήδη αντικατασταθεί.')
  }

  const project = item.analysis.project
  const context: ProposalProjectContext = {
    projectName: project.name,
    projectDescription: project.description,
    startDate: project.startDate,
    dueDate: project.dueDate,
  }

  const nameMap = buildNameMap([
    project.name,
    project.primaryCompany?.NAME ?? '',
    ...project.companies.map((c) => c.company.NAME),
  ])

  // Ίδια πολιτική με την αρχική ανάλυση: ό,τι φεύγει προς την Κίνα είναι
  // μασκαρισμένο — και το κείμενο της πρότασης ΚΑΙ η διευκρίνιση του χρήστη,
  // που μπορεί κάλλιστα να γράφει «μίλα με τον Γιώργο στο 6971234567».
  const mask = (s: string) => pseudonymizeNames(maskProposalPII(s), nameMap)

  const { system, user } = buildRegeneratePrompt({
    item: {
      kind: item.kind,
      title: mask(item.title),
      description: item.description ? mask(item.description) : null,
      sourceQuote: item.sourceQuote ? mask(item.sourceQuote) : null,
      estimatedHours: item.estimatedHours,
      suggestedOffsetDays: item.suggestedOffsetDays,
    },
    clarification: mask(clarification),
    contextText: mask(findQuoteWindow(item.analysis.extractedText, item.sourceQuote)),
    context,
  })

  const res = await (args.call ?? callProposalLlm)({ system, user })
  const parsed = parseChunkExtraction(res.raw)

  if (parsed.items.length === 0) {
    throw new Error('Το μοντέλο δεν επέστρεψε τίποτα αξιοποιήσιμο. Δοκίμασε πιο συγκεκριμένη διατύπωση.')
  }

  const titles: string[] = []

  await prisma.$transaction(async (tx) => {
    await tx.proposalItem.update({
      where: { id: item.id },
      data: { status: 'replaced', clarification },
    })

    for (const [i, fresh] of parsed.items.entries()) {
      const created = await tx.proposalItem.create({
        data: {
          analysisId: item.analysisId,
          kind: fresh.kind,
          // Στη θέση του αρχικού· τα επόμενα σπρώχνονται από την ταξινόμηση.
          order: item.order + i,
          title: restoreNames(fresh.title, nameMap),
          description: fresh.description ? restoreNames(fresh.description, nameMap) : null,
          suggestedDueDate: item.suggestedDueDate,
          suggestedOffsetDays: fresh.suggestedOffsetDays,
          estimatedHours: fresh.estimatedHours,
          priority: fresh.priority,
          visibility: item.visibility,
          requirementCategory: fresh.requirementCategory,
          sourceQuote: restoreNames(fresh.sourceQuote, nameMap),
          confidence: fresh.confidence,
          // Η ανάθεση επιβιώνει: ο άνθρωπος την έβαλε, δεν την πρότεινε το μοντέλο.
          assigneeId: item.assigneeId,
          clarification,
          regeneratedFromId: item.id,
        },
        select: { title: true },
      })
      titles.push(created.title)
    }
  })

  return { created: parsed.items.length, titles }
}
