export type DashScope = { userId: string; isPrivileged: boolean; now?: Date }

export type AttentionItem = {
  kind: 'ticket_new' | 'ticket_reply' | 'approval' | 'missing_resolution' | 'kb_draft' | 'question' | 'meeting_review'
  id: string            // id της πηγής (ticketId/taskId/questionId)
  title: string
  subtitle: string | null
  href: string          // πλήρες link πλοήγησης
  ageHours: number
  // inline ενέργεια που μπορεί να γίνει χωρίς πλοήγηση (βλ. Ζώνη 1 στο spec)
  action: 'open' | 'approve' | 'write_resolution' | null
  taskId: string | null // για approve / write_resolution
  ticket: { id: string; code: string; subject: string } | null
}

export type MyDayData = {
  today: { id: string; title: string; kind: 'task' | 'meeting'; time: string | null; projectName: string | null; href: string }[]
  tomorrow: { id: string; title: string; projectName: string | null; href: string }[]
  inProgress: {
    id: string; title: string; projectName: string; href: string
    accumulatedMs: number; startedAtIso: string | null
    fromTicket: boolean
  }[]
  overdue: { id: string; title: string; projectName: string; daysLate: number; href: string }[]
}

export type CapacityRow = {
  userId: string; name: string; email: string; avatarUrl?: string
  openTasks: number; overdue: number
  busyHours: number; capacityHours: number; utilizationPct: number
  nextFreeIso: string | null; freeNow: boolean
}

export type RadarDay = {
  dayIso: string          // YYYY-MM-DD
  label: string           // «Δευ 21»
  isToday: boolean
  isWeekend: boolean
  projectDeadlines: { id: string; name: string; color: string }[]
}

/** Mini-Gantt: μπάρα task που απλώνεται σε στήλες ημερών (0–6, clamped). */
export type RadarSpan = {
  id: string
  title: string
  href: string
  color: string
  projectName: string
  startCol: number
  endCol: number
  rangeLabel: string
  assignees: { name: string; avatarUrl?: string }[]
}

export type RadarData = { days: RadarDay[]; spans: RadarSpan[] }

export type PulseData = {
  kpis: {
    openTickets: number
    completedThisWeek: { value: number; delta: number | null }
    overdueTotal: number
    avgResolutionHours: { value: number | null; n: number }
  }
  pendingEmails: { id: string; subject: string; projectId: string; projectName: string; receivedAtIso: string | null }[]
  activity: { id: string; dayIso: string; actorName: string; text: string; createdAtIso: string }[]
  hotProjects: { id: string; name: string; color: string; done: number; total: number; lastActivityIso: string }[]
}
