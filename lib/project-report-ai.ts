import type { ProjectReportAnalytics, ProjectReportProject } from './project-report-analytics';

export type ProjectReportJourneyItem = {
  date: string;
  title: string;
  text: string;
};

export type ProjectReportNarrative = {
  headline: string;
  executiveSummary: string;
  journey: ProjectReportJourneyItem[];
  customerParagraph: string;
  teamParagraph: string;
  dgsmartParagraph: string;
  highlights: string[];
  closingParagraph: string;
};

export type ProjectReportNarrativeResult = {
  narrative: ProjectReportNarrative;
  aiGenerated: boolean;
  provider: string | null;
  model: string | null;
};

type PromptMessage = { system: string; user: string };

const SYSTEM_PROMPT = `Είσαι ο συντάκτης αναφορών πελατών της DGSmart.
Γράφεις αποκλειστικά στα Ελληνικά, με απλά λόγια, ανθρώπινο και επαγγελματικό μαρκετίστικο ύφος. Η αναφορά απευθύνεται σε πελάτη που θέλει να καταλάβει γρήγορα την πορεία του έργου.

ΕΠΙΣΤΡΕΨΕ ΜΟΝΟ ΕΓΚΥΡΟ JSON με αυτή τη δομή:
{
  "headline": "μία σύντομη, ουσιαστική κύρια φράση",
  "executiveSummary": "2-4 προτάσεις με τη συνολική εικόνα",
  "journey": [
    {"date": "πραγματική ημερομηνία ή περίοδος από τα δεδομένα", "title": "σύντομος τίτλος φάσης", "text": "1-2 απλές προτάσεις"}
  ],
  "customerParagraph": "ξεκάθαρη εικόνα για τα tasks που άνοιξε ο πελάτης και τον χρόνο κλεισίματος",
  "teamParagraph": "απλή περιγραφή της δουλειάς ανά χρήστη, βάσει των metrics.users",
  "dgsmartParagraph": "συγκεκριμένη συνεισφορά της DGSmart στο κλείσιμο των tasks και στην πρόοδο",
  "highlights": ["3-5 σύντομα, συγκεκριμένα επιτεύγματα"],
  "closingParagraph": "1-2 φιλικές προτάσεις για το επόμενο βήμα"
}

ΑΠΑΡΑΙΤΗΤΟΙ ΚΑΝΟΝΕΣ ΑΚΡΙΒΕΙΑΣ:
1. Χρησιμοποίησε ΜΟΝΟ γεγονότα, ονόματα, ημερομηνίες και αριθμούς που υπάρχουν στο JSON της εισροδού. Μην επινοείς μετρήσεις, οικονομικό όφελος, εξοικονόμηση χρόνου, υποσχέσεις ή επόμενες προθεσμίες.
2. Κάλυψε την πορεία από την αρχή έως το generatedAt. Η journey πρέπει να ακολουθεί χρονολογική σειρά και να έχει 3-6 πραγματικές φάσεις, όχι γενικόλογα στάδια.
3. Ξεχώρισε πάντα τα συνολικά tasks του έργου από τα tasks που δημιούργησε ο ίδιος ο πελάτης. Ο χρόνος κλεισίματος μετράται από createdAt έως completedAt.
4. Για κάθε χρήστη με ουσιαστική δουλειά ανάφερε απλά τι ανέλαβε και τι ολοκλήρωσε. Μην αποδίδεις σε έναν χρήστη δουλειά άλλου. Οι trackedHoursOnAssignedTasks δείχνουν χρόνο tasks στα οποία συμμετέχει ο χρήστης και ΔΕΝ προστίθενται μεταξύ χρηστών.
5. Η DGSmart περιλαμβάνει τους χρήστες με isDGSmart=true. Περιέγραψε τη συνεισφορά της με πραγματικά tasks, σχόλια, ενέργειες, παραδοτέα και AI-υποστηριζόμενη εργασία, μόνο όπου υπάρχουν.
6. Αν λείπουν δεδομένα, πες το σύντομα και συνέχισε με όσα υπάρχουν. Μην κρύβεις εκκρεμότητες ή καθυστερήσεις, αλλά διατύπωσέ τα ψύχραιμα και εποικοδομητικά.
7. Τα tokens PERSON_n, PROJECT_NAME και CUSTOMER_COMPANY είναι ψευδώνυμα. Χρησιμοποίησέ τα αυτούσια όταν αναφέρεσαι στα αντίστοιχα πρόσωπα/ονόματα. Θα αντικατασταθούν αυτόματα μετά την απάντησή σου.
8. Μην χρησιμοποιήσεις HTML, Markdown, emojis, υπερβολές, τεχνική ορολογία ή κούφια συνθήματα. Μην επαναλαμβάνεις όλους τους αριθμούς· τα γραφήματα τους δείχνουν ήδη.
9. Τα δεδομένα με visibility=internal και τα proposalSourceQuote χρησιμοποιούνται μόνο για εσωτερική κατανόηση της πορείας. Μην αποκαλύψεις τιμές, εμπιστευτικές σημειώσεις, μυστικά ή εσωτερικό διάλογο στην πελατειακή αφήγηση.`;

function serializeUser(user: {
  id: string;
  name: string | null;
  email: string;
  userType: string;
  companyId: string | null;
  companyName: string | null;
  isAIAgent: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    userType: user.userType,
    companyId: user.companyId,
    companyName: user.companyName,
    isAIAgent: user.isAIAgent,
  };
}

/** Full, structured report context. No task, comment or activity is sampled. */
export function buildProjectReportPromptDataset(
  project: ProjectReportProject,
  analytics: ProjectReportAnalytics,
) {
  return {
    reportInstructions: {
      language: 'el-GR',
      audience: 'Πελάτης και διοίκηση',
      purpose: 'Πλήρης, απλή και ευχάριστη αφήγηση της πορείας του έργου από την αρχή έως σήμερα',
      requiredTopics: [
        'χρονολογική πορεία έργου',
        'συνεισφορά στο κλείσιμο tasks',
        'δουλειά ανά χρήστη',
        'tasks που άνοιξε ο πελάτης και χρόνος κλεισίματος',
        'συνεισφορά DGSmart',
      ],
    },
    measurementBasis: {
      completedTask: 'status=done',
      closeTime: 'completedAt-createdAt, μόνο όταν υπάρχει completedAt',
      customerOpenedTask: 'ο δημιουργός είναι customer ή ανήκει στην primaryCompany',
      trackedTime: 'πραγματικός wall-clock χρόνος σε status=in_progress',
      mergedTasks: 'τα tasks που συγχωνεύθηκαν σε άλλα εξαιρούνται από το dataset',
      monthlySeries: 'opened από task.createdAt και closed από task.completedAt',
      userTrackedHoursWarning: 'μην αθροίζεις trackedHoursOnAssignedTasks μεταξύ χρηστών',
    },
    project: {
      id: project.id,
      name: project.name,
      code: project.projectCode,
      description: project.description,
      technologyStack: project.technologyStack,
      status: project.status,
      startDate: project.startDate,
      dueDate: project.dueDate,
      progress: project.progress,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      owner: serializeUser(project.owner),
      customer: project.primaryCompany
        ? { id: project.primaryCompany.id, name: project.primaryCompany.NAME }
        : null,
      members: project.members.map((member) => ({
        title: member.title,
        responsibilities: member.responsibilities,
        user: serializeUser(member.user),
      })),
    },
    metrics: analytics,
    tasks: project.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      visibility: task.visibility,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startDate: task.startDate,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      estimatedHours: task.estimatedHours,
      inProgressStartedAt: task.inProgressStartedAt,
      inProgressAccumulatedMs: task.inProgressAccumulatedMs,
      isMilestone: task.isMilestone,
      generatedFromMeetingId: task.generatedFromMeetingId,
      generatedFromProposalId: task.generatedFromProposalId,
      meetingSourceQuote: task.meetingSourceQuote,
      meetingSourceConfidence: task.meetingSourceConfidence,
      proposalSourceQuote: task.proposalSourceQuote,
      proposalConfidence: task.proposalConfidence,
      aiBlockedReason: task.aiBlockedReason,
      creator: serializeUser(task.creator),
      activeAIAgent: task.activeAIAgent ? serializeUser(task.activeAIAgent) : null,
      assignees: task.assignees.map((assignment) => serializeUser(assignment.user)),
      tags: task.tags.map((tag) => tag.name),
      requirements: task.requirements.map((link) => ({
        code: link.requirement.code,
        title: link.requirement.title,
        status: link.requirement.status,
      })),
      questions: task.questions.map((question) => ({
        question: question.question,
        answer: question.answer,
        createdAt: question.createdAt,
        answeredAt: question.answeredAt,
        askedBy: serializeUser(question.askedBy),
        askedTo: serializeUser(question.askedTo),
      })),
      comments: task.comments.map((comment) => ({
        content: comment.content,
        visibility: comment.visibility,
        createdAt: comment.createdAt,
        author: serializeUser(comment.author),
      })),
      activities: project.activities
        .filter((activity) => activity.taskId === task.id)
        .map((activity) => ({
          action: activity.action,
          targetType: activity.targetType,
          metadata: activity.metadata,
          createdAt: activity.createdAt,
          actor: serializeUser(activity.actor),
        })),
      resolutions: task.resolutions.map((resolution) => ({
        summary: resolution.summary,
        changes: resolution.changes,
        commits: resolution.commits,
        testResults: resolution.testResults,
        artifacts: resolution.artifacts,
        remainingIssues: resolution.remainingIssues,
        status: resolution.status,
        reviewFeedback: resolution.reviewFeedback,
        submittedAt: resolution.submittedAt,
        reviewedAt: resolution.reviewedAt,
        agent: serializeUser(resolution.agent),
      })),
    })),
    projectActivities: project.activities.map((activity) => ({
      taskId: activity.taskId,
      action: activity.action,
      targetType: activity.targetType,
      metadata: activity.metadata,
      createdAt: activity.createdAt,
      actor: serializeUser(activity.actor),
    })),
    meetings: project.meetings.map((meeting) => ({
      subject: meeting.subject,
      startedAt: meeting.startedAt,
      summary: meeting.summary,
      decisions: meeting.decisions,
      actionItems: meeting.actionItems,
      risks: meeting.risks,
      openQuestions: meeting.openQuestions,
      autoTasksCreated: meeting.autoTasksCreated,
      autoTasksNeedReview: meeting.autoTasksNeedReview,
    })),
    emailHistory: project.emailMessages.map((email) => ({
      taskId: email.taskId,
      direction: email.direction,
      status: email.status,
      subject: email.subject,
      bodyPreview: email.bodyPreview,
      bodyHtml: email.bodyHtml,
      appliedNote: email.appliedNote,
      receivedAt: email.receivedAt,
      sentAt: email.sentAt,
      user: serializeUser(email.user),
    })),
    proposalAnalyses: project.proposalAnalyses.map((analysis) => ({
      fileName: analysis.fileName,
      status: analysis.status,
      summary: analysis.summary,
      createdAt: analysis.createdAt,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 5000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function parseProjectReportNarrative(raw: string): ProjectReportNarrative {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }

  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error(`Το AI δεν επέστρεψε έγκυρο JSON: ${cleaned.slice(0, 160)}`);
  }
  if (!isRecord(value)) throw new Error('Η απάντηση του AI δεν έχει τη μορφή αντικειμένου.');

  const journey = Array.isArray(value.journey)
    ? value.journey.slice(0, 8).flatMap((item) => {
        if (!isRecord(item)) return [];
        const title = cleanText(item.title, 180);
        const text = cleanText(item.text, 1400);
        if (!title || !text) return [];
        return [{ date: cleanText(item.date, 100), title, text }];
      })
    : [];
  const highlights = Array.isArray(value.highlights)
    ? value.highlights.map((item) => cleanText(item, 400)).filter(Boolean).slice(0, 5)
    : [];

  const narrative: ProjectReportNarrative = {
    headline: cleanText(value.headline, 240),
    executiveSummary: cleanText(value.executiveSummary),
    journey,
    customerParagraph: cleanText(value.customerParagraph),
    teamParagraph: cleanText(value.teamParagraph),
    dgsmartParagraph: cleanText(value.dgsmartParagraph),
    highlights,
    closingParagraph: cleanText(value.closingParagraph, 1800),
  };

  if (!narrative.headline || !narrative.executiveSummary) {
    throw new Error('Η AI αφήγηση δεν περιέχει τίτλο και κεντρική σύνοψη.');
  }
  return narrative;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return 'χωρίς καταχωρισμένη ημερομηνία';
  return date.toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function daysLabel(value: number | null): string {
  if (value === null) return 'δεν υπάρχουν ακόμη επαρκή δεδομένα';
  return `${value} ${value === 1 ? 'ημέρα' : 'ημέρες'} κατά μέσο όρο`;
}

export function buildFallbackProjectReportNarrative(
  project: ProjectReportProject,
  analytics: ProjectReportAnalytics,
): ProjectReportNarrative {
  const latestCompletion = project.tasks
    .filter((task) => task.completedAt)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0]?.completedAt ?? null;
  const contributors = analytics.users
    .filter((user) => user.assignedTasks > 0)
    .slice(0, 4)
    .map((user) => `${user.name}: ${user.completedTasks}/${user.assignedTasks} ολοκληρωμένες`)
    .join(', ');
  const customerName = analytics.customer.companyName ?? 'Ο πελάτης';

  return {
    headline: `${analytics.completedTasks} από ${analytics.totalTasks} εργασίες έχουν ολοκληρωθεί`,
    executiveSummary: `Το έργο «${project.name}» ξεκίνησε στις ${formatDate(project.startDate ?? project.createdAt)} και σήμερα βρίσκεται στο ${analytics.completionPercentage}% της πορείας των εργασιών. Έχουν καταχωριστεί ${analytics.totalTasks} εργασίες, από τις οποίες ${analytics.openTasks} παραμένουν ανοιχτές. Η αναφορά συγκεντρώνει την πραγματική δουλειά της ομάδας και τα επόμενα σημεία που χρειάζονται προσοχή.`,
    journey: [
      {
        date: formatDate(project.startDate ?? project.createdAt),
        title: 'Έναρξη και οργάνωση',
        text: `Δημιουργήθηκε το έργο και ξεκίνησε η καταγραφή των εργασιών${project.description ? ` με βάση τον στόχο: ${project.description}` : '.'}`,
      },
      ...(latestCompletion
        ? [{
            date: formatDate(latestCompletion),
            title: 'Ολοκλήρωση εργασιών',
            text: `Μέχρι τη σημαντικότερη πρόσφατη ολοκλήρωση είχαν παραδοθεί ${analytics.completedTasks} εργασίες. Ο μέσος χρόνος από το άνοιγμα έως το κλείσιμο είναι ${daysLabel(analytics.averageCloseDays)}.`,
          }]
        : []),
      {
        date: formatDate(new Date(analytics.generatedAt)),
        title: 'Σημερινή εικόνα',
        text: `${analytics.completedTasks} εργασίες έχουν κλείσει και ${analytics.openTasks} συνεχίζονται ή εκκρεμούν. Η ομάδα έχει καταγράψει ${analytics.totalTrackedHours} ώρες πραγματικής εργασίας.`,
      },
    ],
    customerParagraph: analytics.customer.openedTasks > 0
      ? `${customerName} δημιούργησε ${analytics.customer.openedTasks} tasks. Από αυτά έχουν ολοκληρωθεί ${analytics.customer.completedTasks} και παραμένουν ανοιχτά ${analytics.customer.openTasks}. Ο μέσος χρόνος κλεισίματος είναι ${daysLabel(analytics.customer.averageCloseDays)} και η διάμεση τιμή ${analytics.customer.medianCloseDays ?? '—'} ημέρες.`
      : `${customerName} δεν εμφανίζεται ως δημιουργός tasks στο έργο. Η ομάδα έχει καταγράψει συνολικά ${analytics.totalTasks} εργασίες και έχει ολοκληρώσει ${analytics.completedTasks}.`,
    teamParagraph: contributors
      ? `Η δουλειά κατανέμεται ως εξής: ${contributors}. Οι ώρες ανά χρήστη αφορούν tasks στα οποία συμμετέχει και δεν αθροίζονται μεταξύ τους.`
      : 'Δεν έχουν καταχωριστεί ακόμη αναθέσεις εργασιών σε χρήστες.',
    dgsmartParagraph: `Η DGSmart συμμετέχει σε ${analytics.dgsmart.assignedTasks} tasks και έχει ολοκληρώσει ${analytics.dgsmart.completedTasks}. Έχει καταγράψει ${analytics.dgsmart.comments} σχόλια και ${analytics.dgsmart.activities} ενέργειες, με ${analytics.dgsmart.trackedHours} ώρες σε tasks όπου συμμετέχει. Από το σύστημα έχουν δημιουργηθεί ${analytics.dgsmart.meetingGeneratedTasks} tasks από συναντήσεις και ${analytics.dgsmart.proposalGeneratedTasks} από την πρόταση.`,
    highlights: [
      `${analytics.completionPercentage}% των εργασιών έχει ολοκληρωθεί.`,
      `${analytics.completedTasks} tasks έχουν παραδοθεί από την ομάδα.`,
      `${analytics.totalTrackedHours} ώρες πραγματικής εργασίας έχουν καταγραφεί.`,
    ],
    closingParagraph: analytics.openTasks > 0
      ? `Το επόμενο βήμα είναι η συντονισμένη ολοκλήρωση των ${analytics.openTasks} ανοιχτών εργασιών, με προτεραιότητα στις εκκρεμότητες και στα tasks που πλησιάζουν στη λήξη τους.`
      : 'Όλες οι καταχωρισμένες εργασίες έχουν ολοκληρωθεί. Το έργο έχει πλέον μια καθαρή και τεκμηριωμένη εικόνα παράδοσης.',
  };
}

function addToken(mapping: Map<string, string>, token: string, realValue: string | null | undefined) {
  const value = realValue?.trim();
  if (value && !mapping.has(token)) mapping.set(token, value);
}

function createPseudonymMapping(
  project: ProjectReportProject,
  analytics: ProjectReportAnalytics,
): Map<string, string> {
  const mapping = new Map<string, string>();
  addToken(mapping, 'PROJECT_NAME', project.name);
  addToken(mapping, 'CUSTOMER_COMPANY', project.primaryCompany?.NAME);
  analytics.users.forEach((user, index) => addToken(mapping, `PERSON_${index + 1}`, user.name));
  return mapping;
}

function maskText(
  input: string,
  mapping: Map<string, string>,
  counters: { email: number; phone: number; afm: number },
): string {
  let output = input;
  const known = [...mapping.entries()]
    .filter(([, real]) => real.length > 1)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [token, real] of known) output = output.split(real).join(token);

  output = output.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => `EMAIL_${++counters.email}`);
  output = output.replace(/\b\d{9}\b/g, () => `AFM_${++counters.afm}`);
  output = output.replace(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3}[\s-]?\d{3,4}(?:[\s-]?\d{2,4})?/g, (match) => {
    // Keep ISO dates, project codes and short numeric identifiers intact.
    if (match.replace(/\D/g, '').length < 10 || /\d{4}-\d{2}-\d{2}/.test(match)) return match;
    return `PHONE_${++counters.phone}`;
  });
  return output;
}

function maskValue(
  value: unknown,
  mapping: Map<string, string>,
  counters: { email: number; phone: number; afm: number },
): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return maskText(value, mapping, counters);
  if (Array.isArray(value)) return value.map((item) => maskValue(item, mapping, counters));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, maskValue(item, mapping, counters)]),
    );
  }
  return value;
}

function restoreTokens<T>(value: T, mapping: Map<string, string>): T {
  if (typeof value === 'string') {
    let output: string = value;
    for (const [token, real] of [...mapping.entries()].sort((a, b) => b[0].length - a[0].length)) {
      output = output.split(token).join(real);
    }
    return output as unknown as T;
  }
  if (Array.isArray(value)) return value.map((item) => restoreTokens(item, mapping)) as T;
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, restoreTokens(item, mapping)]),
    ) as T;
  }
  return value;
}

export function createProjectReportPrompt(
  project: ProjectReportProject,
  analytics: ProjectReportAnalytics,
): PromptMessage & { mapping: Map<string, string> } {
  const mapping = createPseudonymMapping(project, analytics);
  const dataset = buildProjectReportPromptDataset(project, analytics);
  const masked = maskValue(dataset, mapping, { email: 0, phone: 0, afm: 0 });
  return {
    system: SYSTEM_PROMPT,
    user: `Παράγε την πλήρη αναφορά από το παρακάτω JSON. Περιέχει ΟΛΑ τα σχετικά tasks, τις αναθέσεις, τα σχόλια, τις ερωτήσεις, τις ενέργειες, τις συναντήσεις, τα emails και τα προ-υπολογισμένα metrics. Μην παραλείψεις από την ανάλυσή σου κανένα στάδιο του χρονολογίου.\n\n${JSON.stringify(masked)}`,
    mapping,
  };
}

async function requestNarrativeJson(prompt: PromptMessage): Promise<{
  raw: string;
  provider: string;
  model: string;
}> {
  const provider = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  let url: string;
  let model: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider === 'azure-openai') {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    if (!endpoint || !apiKey || !deployment) {
      throw new Error('Azure OpenAI δεν έχει ρυθμιστεί πλήρως.');
    }
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';
    url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    model = deployment;
    headers = { 'Content-Type': 'application/json', 'api-key': apiKey };
    body = {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.25,
      max_tokens: 6000,
    };
  } else if (provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('Λείπει το DEEPSEEK_API_KEY.');
    url = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
    model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
    body = {
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.25,
      max_tokens: 6000,
    };
  } else {
    throw new Error(`Μη υποστηριζόμενος LLM_PROVIDER: ${provider}`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`AI provider ${response.status}: ${errorBody.slice(0, 500)}`);
  }
  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('Ο AI provider επέστρεψε κενή απάντηση.');
  return { raw, provider, model };
}

export async function generateProjectReportNarrative(
  project: ProjectReportProject,
  analytics: ProjectReportAnalytics,
): Promise<ProjectReportNarrativeResult> {
  const prompt = createProjectReportPrompt(project, analytics);
  try {
    const response = await requestNarrativeJson(prompt);
    const parsed = parseProjectReportNarrative(response.raw);
    return {
      narrative: restoreTokens(parsed, prompt.mapping),
      aiGenerated: true,
      provider: response.provider,
      model: response.model,
    };
  } catch (error) {
    console.error('AI project report failed; using deterministic narrative:', error instanceof Error ? error.message : error);
    return {
      narrative: buildFallbackProjectReportNarrative(project, analytics),
      aiGenerated: false,
      provider: null,
      model: null,
    };
  }
}
