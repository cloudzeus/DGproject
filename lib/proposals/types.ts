/**
 * Τύποι της ανάλυσης πρότασης.
 *
 * Ξεχωριστοί από τα Prisma types επίτηδες: αυτό που γυρίζει το μοντέλο δεν
 * είναι ακόμη γραμμή βάσης — δεν έχει id, δεν έχει analysisId, και μπορεί να
 * απορριφθεί ολόκληρο. Ο διαχωρισμός κρατά τον parser ελεγχόμενο χωρίς βάση.
 */

export type ProposalItemKind = 'step' | 'milestone' | 'requirement'
export type ProposalPriority = 'low' | 'medium' | 'high' | 'urgent'

export type ExtractedItem = {
  kind: ProposalItemKind
  title: string
  description: string
  /**
   * Το αυτούσιο απόσπασμα της πρότασης. Υποχρεωτικό: αντικείμενο χωρίς
   * απόσπασμα απορρίπτεται, γιατί το μοντέλο δεν μπορεί να δείξει πού το βρήκε.
   */
  sourceQuote: string
  confidence: number
  /** Μέρες από την έναρξη του έργου, όταν η πρόταση λέει «εβδομάδα 3». */
  suggestedOffsetDays: number | null
  estimatedHours: number | null
  priority: ProposalPriority | null
  /** λειτουργική | τεχνική | εμπορική — μόνο για kind='requirement'. */
  requirementCategory: string | null
}

/** Ό,τι επιστρέφει ένα τεμάχιο. */
export type ChunkExtraction = {
  summary: string
  items: ExtractedItem[]
}

/** Το πλαίσιο του έργου που συνοδεύει κάθε prompt. */
export type ProposalProjectContext = {
  projectName: string
  projectDescription: string | null
  startDate: Date | null
  dueDate: Date | null
}

export type AnalyzeUsage = {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}
