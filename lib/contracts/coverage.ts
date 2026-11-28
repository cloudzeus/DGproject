import { callProposalLlm } from '@/lib/proposals/llm'
import { buildNameMap, maskProposalPII, pseudonymizeNames, restoreNames } from '@/lib/proposals/mask'

export const COVERAGES = ['covered', 'partial', 'not_found', 'unclear'] as const
export type ContractCoverage = (typeof COVERAGES)[number]

export type ContractCoverageResult = {
  coverage: ContractCoverage
  confidence: number
  evidence: string | null
  explanation: string
}

export function parseContractCoverage(raw: string): ContractCoverageResult {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  let value: unknown
  try { value = JSON.parse(cleaned) } catch { throw new Error('Το DeepSeek δεν επέστρεψε έγκυρο JSON.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Η απάντηση κάλυψης δεν είναι αντικείμενο JSON.')
  const data = value as Record<string, unknown>
  if (!COVERAGES.includes(data.coverage as ContractCoverage)) throw new Error('Η απάντηση περιέχει μη έγκυρο βαθμό κάλυψης.')
  const coverage = data.coverage as ContractCoverage
  const confidence = typeof data.confidence === 'number' ? data.confidence : Number(data.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Η απάντηση περιέχει μη έγκυρη βεβαιότητα.')
  const explanation = typeof data.explanation === 'string' ? data.explanation.trim().slice(0, 4000) : ''
  if (explanation.length < 3) throw new Error('Λείπει η εξήγηση από την απάντηση κάλυψης.')
  const evidence = typeof data.evidence === 'string' ? data.evidence.trim().slice(0, 2000) || null : null
  if ((coverage === 'covered' || coverage === 'partial') && !evidence) {
    throw new Error('Η θετική κάλυψη χρειάζεται αυτούσιο απόσπασμα από τη σύμβαση.')
  }
  return { coverage, confidence, evidence, explanation }
}

export async function analyzeTaskContractCoverage(input: {
  contractText: string
  taskTitle: string
  taskDescription: string | null
  sensitiveNames?: string[]
}): Promise<ContractCoverageResult> {
  const names = buildNameMap(input.sensitiveNames ?? [])
  const protect = (text: string) => pseudonymizeNames(maskProposalPII(text), names)
  const result = await callProposalLlm({
    maxTokens: 1800,
    system: `Είσαι βοηθός ελέγχου συμβατικού εύρους, όχι δικηγόρος. Σύγκρινε ΜΟΝΟ την εργασία με το παρεχόμενο κείμενο σύμβασης. Μην υποθέτεις συμφωνίες και μην επινοείς αποσπάσματα. Απάντησε αποκλειστικά JSON με keys: coverage ("covered" | "partial" | "not_found" | "unclear"), confidence (0 έως 1), evidence (αυτούσιο σύντομο απόσπασμα στα ελληνικά ή null), explanation (σύντομη εξήγηση στα ελληνικά). covered = το πλήρες εύρος της εργασίας τεκμηριώνεται ρητά. partial = μόνο μέρος τεκμηριώνεται. not_found = υπάρχει σχετικό πλαίσιο αλλά η εργασία δεν περιλαμβάνεται. unclear = το κείμενο δεν επαρκεί για αξιόπιστο συμπέρασμα. Για covered/partial το evidence είναι υποχρεωτικό και πρέπει να αντιγράφεται αυτούσιο από τη σύμβαση.`,
    user: `ΕΡΓΑΣΙΑ\nΤίτλος: ${protect(input.taskTitle)}\nΠεριγραφή: ${protect(input.taskDescription ?? '') || '—'}\n\nΣΥΜΒΑΣΗ\n${protect(input.contractText)}`,
  })
  const parsed = parseContractCoverage(result.raw)
  return {
    ...parsed,
    evidence: parsed.evidence ? restoreNames(parsed.evidence, names) : null,
    explanation: restoreNames(parsed.explanation, names),
  }
}
