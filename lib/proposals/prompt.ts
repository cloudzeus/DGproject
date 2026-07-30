/**
 * Το prompt της ανάλυσης πρότασης.
 *
 * Τρεις σχεδιαστικές επιλογές που δεν είναι προφανείς:
 *
 *   1. **Υποχρεωτικό απόσπασμα.** Κάθε αντικείμενο πρέπει να δείχνει πού το
 *      βρήκε. Χωρίς αυτό, το μοντέλο συμπληρώνει «λογικά» βήματα που κανείς
 *      δεν συμφώνησε — και ο χρήστης δεν έχει τρόπο να το πιάσει.
 *   2. **Διάκριση βήματος/οροσήμου.** Το ορόσημο είναι παραδοτέο με ημερομηνία,
 *      το βήμα είναι δουλειά. Χωρίς ρητό ορισμό το μοντέλο τα ανακατεύει.
 *   3. **Μετατόπιση σε μέρες αντί για ημερομηνία.** Οι προτάσεις γράφουν
 *      «εβδομάδα 3», όχι «14/09». Ζητάμε το offset και το UI το μετατρέπει.
 */

import type { ProposalProjectContext } from './types'

export type BuildProposalPromptInput = {
  chunkText: string
  chunkIndex: number
  chunkTotal: number
  context: ProposalProjectContext
}

const SYSTEM = `Είσαι έμπειρος project manager σε ελληνική εταιρεία πληροφορικής.
Διαβάζεις προτάσεις έργων και βγάζεις από αυτές εκτελέσιμο πλάνο.

Απαντάς ΠΑΝΤΑ με έγκυρο JSON, χωρίς σχόλια και χωρίς markdown fences.
Γράφεις στα ελληνικά.

ΚΑΝΟΝΕΣ:
- Κάθε αντικείμενο ΠΡΕΠΕΙ να έχει "sourceQuote": αυτούσιο απόσπασμα του κειμένου
  που το στηρίζει. Αν δεν μπορείς να δείξεις απόσπασμα, ΜΗΝ το συμπεριλάβεις.
- ΜΗΝ επινοείς βήματα που «λογικά θα χρειαστούν». Μόνο ό,τι λέει η πρόταση.
- Το κείμενο μπορεί να περιέχει δείκτες [email], [τηλέφωνο], [ΑΦΜ], [IBAN] και
  ΟΝΟΜΑ_1, ΟΝΟΜΑ_2… Άφησέ τους ΑΚΡΙΒΩΣ όπως είναι — μην τους αντικαταστήσεις.

ΕΙΔΗ:
- "step": δουλειά που πρέπει να γίνει. Γίνεται εργασία.
- "milestone": παραδοτέο ή σημείο παράδοσης με χρονική στιγμή. Γίνεται εργασία
  με σήμανση οροσήμου. Αν κάτι είναι και τα δύο, διάλεξε "milestone".
- "requirement": τι πρέπει να πληροί το αποτέλεσμα — συμφωνημένο εύρος,
  προδιαγραφή, υποχρέωση. ΔΕΝ είναι δουλειά, είναι κριτήριο αποδοχής.`

export function buildProposalPrompt(input: BuildProposalPromptInput): {
  system: string
  user: string
} {
  const { context } = input

  const scope =
    input.chunkTotal > 1
      ? `Αυτό είναι το τμήμα ${input.chunkIndex + 1} από ${input.chunkTotal} της πρότασης.
Ανάλυσε ΜΟΝΟ ό,τι περιέχεται εδώ. Άλλα τμήματα αναλύονται χωριστά — μην
συμπληρώνεις ό,τι νομίζεις ότι λείπει επειδή κόπηκε το κείμενο.`
      : 'Αυτή είναι ολόκληρη η πρόταση.'

  const dates = [
    context.startDate ? `Έναρξη έργου: ${iso(context.startDate)}` : null,
    context.dueDate ? `Προθεσμία έργου: ${iso(context.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const user = `ΕΡΓΟ: ${context.projectName}
${context.projectDescription ? `ΠΕΡΙΓΡΑΦΗ: ${context.projectDescription}` : ''}
${dates}

${scope}

--- ΚΕΙΜΕΝΟ ΠΡΟΤΑΣΗΣ ---
${input.chunkText}
--- ΤΕΛΟΣ ΚΕΙΜΕΝΟΥ ---

Επίστρεψε JSON με αυτή ΑΚΡΙΒΩΣ τη δομή:

{
  "summary": "2-3 προτάσεις: τι ζητά το έργο σε αυτό το τμήμα",
  "items": [
    {
      "kind": "step" | "milestone" | "requirement",
      "title": "σύντομος τίτλος, έως 100 χαρακτήρες",
      "description": "τι ακριβώς περιλαμβάνει",
      "sourceQuote": "αυτούσιο απόσπασμα από το κείμενο πάνω",
      "confidence": 0.0-1.0,
      "suggestedOffsetDays": αριθμός μερών από την έναρξη ή null,
      "estimatedHours": εκτίμηση ωρών ή null,
      "priority": "low" | "medium" | "high" | "urgent" | null,
      "requirementCategory": "λειτουργική" | "τεχνική" | "εμπορική" | null
    }
  ]
}

Το "confidence" δείχνει πόσο ρητά το λέει η πρόταση: 0.9+ αν γράφεται
κατά λέξη, 0.5-0.7 αν προκύπτει από συμφραζόμενα, κάτω από 0.5 αν εικάζεις.
Το "requirementCategory" μόνο για kind="requirement", αλλιώς null.
Το "suggestedOffsetDays" μόνο αν η πρόταση δίνει χρόνο («εβδομάδα 3» → 21).`

  return { system: SYSTEM, user }
}

/**
 * Το τελικό πέρασμα: ενώνει ό,τι έσπασε στα σύνορα των τεμαχίων και βάζει τα
 * βήματα σε σειρά εκτέλεσης. Δουλεύει πάνω σε τίτλους και περιγραφές, όχι στο
 * αρχικό κείμενο — χωράει άνετα σε μία κλήση ακόμη και για 50 σελίδες.
 */
export function buildMergePrompt(
  items: Array<{ kind: string; title: string; description: string }>,
  context: ProposalProjectContext,
): { system: string; user: string } {
  const user = `ΕΡΓΟ: ${context.projectName}

Παρακάτω είναι αντικείμενα που εξήχθησαν από διαφορετικά τμήματα της ίδιας
πρότασης. Κάποια είναι διπλά με λίγο διαφορετική διατύπωση, κάποια είναι
κομμάτια του ίδιου πράγματος που κόπηκε στα δύο.

${JSON.stringify(items, null, 1)}

Επίστρεψε JSON: { "items": [ { "kind", "title", "description", "keepIndexes": [αριθμοί] } ] }

- "keepIndexes": οι θέσεις (0-based) της αρχικής λίστας που συγχωνεύτηκαν σε αυτό.
- Βάλε τα "step" σε σειρά εκτέλεσης, τα "milestone" σε χρονική σειρά.
- ΜΗΝ προσθέσεις αντικείμενα που δεν υπάρχουν στη λίστα.
- Κράτα τα ελληνικά και τους δείκτες ΟΝΟΜΑ_1, [email] κ.λπ. ως έχουν.`

  return { system: SYSTEM, user }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
