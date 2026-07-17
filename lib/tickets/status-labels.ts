import type { TicketStatus } from '@prisma/client'

// Public-facing Greek labels. Internal triage states collapse to
// «Σε αξιολόγηση» — reporters never see the internal pipeline.
export const TICKET_PUBLIC_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Σε αξιολόγηση',
  analyzing: 'Σε αξιολόγηση',
  triaged: 'Σε αξιολόγηση',
  converted: 'Σε επεξεργασία',
  resolved: 'Ολοκληρώθηκε',
  closed: 'Έκλεισε',
  rejected: 'Απορρίφθηκε',
  needs_info: 'Αναμονή απάντησής σας',
  merged: 'Συγχωνεύθηκε',
}

// Internal labels for the admin UI.
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Νέο',
  analyzing: 'Αναλύεται',
  triaged: 'Προς ανάθεση',
  converted: 'Σε επεξεργασία',
  resolved: 'Ολοκληρώθηκε',
  closed: 'Έκλεισε',
  rejected: 'Απορρίφθηκε',
  needs_info: 'Αναμονή πελάτη',
  merged: 'Συγχωνεύθηκε',
}

// Public labels for sanitized event types (null = hidden from public).
export function publicEventLabel(type: string, payload: Record<string, unknown> | null): string | null {
  switch (type) {
    case 'created':
      return 'Το αίτημα καταχωρήθηκε'
    case 'converted':
      return 'Το αίτημα ανατέθηκε στην ομάδα'
    case 'task_status': {
      const s = payload?.status
      if (s === 'in_progress') return 'Ξεκίνησε η επεξεργασία'
      if (s === 'review') return 'Σε έλεγχο ποιότητας'
      if (s === 'done') return 'Ολοκληρώθηκε'
      return null
    }
    case 'closed':
      return 'Το αίτημα έκλεισε'
    case 'rejected':
      return 'Το αίτημα απορρίφθηκε'
    case 'clarification_requested':
      return 'Ζητήθηκε διευκρίνιση'
    case 'reporter_replied':
      return 'Λάβαμε την απάντησή σας'
    case 'merged':
      return 'Το αίτημα συγχωνεύθηκε με άλλο'
    default:
      return null
  }
}
