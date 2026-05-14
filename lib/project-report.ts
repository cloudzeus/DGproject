import { prisma } from './prisma';
import {
  emailLayout,
  metaTable,
  priorityPill,
  formatGreekDateTime,
  escapeHtml,
  appUrl,
  BRAND,
  pill,
  statRow,
  progressBar,
  sectionHeader,
  personRow,
  infoCard,
  type ActionButton,
} from './email-templates';
import { computeSpentMs, formatSpent } from './task-in-progress-timer';

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Προς έλεγχο',
  done: 'Ολοκληρωμένο',
};

const STATUS_COLOR: Record<string, string> = {
  backlog: '#8A8A8A',
  todo: '#0078D4',
  in_progress: '#D83B01',
  review: '#8764B8',
  done: '#107C10',
};

const PROJECT_STATUS_LABEL: Record<string, string> = {
  active: 'Ενεργό',
  planning: 'Σχεδιασμός',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
};

const STATUS_ORDER: Array<keyof typeof STATUS_LABEL> = ['todo', 'in_progress', 'review', 'done', 'backlog'];

export type ProjectReportData = Awaited<ReturnType<typeof loadProjectForReport>>;

export async function loadProjectForReport(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      tasks: {
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { order: 'asc' }],
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          // Pending Q&A counts per task — surfaces blockers in the report.
          questions: {
            where: { answer: null },
            select: {
              id: true,
              question: true,
              createdAt: true,
              askedBy: { select: { name: true, email: true } },
              askedTo: { select: { name: true, email: true } },
            },
          },
        },
      },
      // Recent meetings & their LLM-extracted risks/openQuestions for the report.
      meetings: {
        orderBy: { startedAt: 'desc' },
        take: 5,
        where: { status: 'ready' },
        select: {
          id: true,
          subject: true,
          startedAt: true,
          summary: true,
          risks: true,
          openQuestions: true,
        },
      },
    },
  });
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function taskRowHtml(t: NonNullable<ProjectReportData>['tasks'][number]): string {
  const due = t.dueDate ? formatGreekDateTime(t.dueDate) : '—';
  const assignees = t.assignees
    .map((a) => escapeHtml(a.user.name ?? a.user.email))
    .join(', ');
  const overdueChip =
    t.dueDate && t.status !== 'done' && t.dueDate.getTime() < Date.now()
      ? `<span style="display:inline-block;font-size:10px;font-weight:700;color:white;background:${BRAND.danger};padding:2px 8px;border-radius:999px;margin-left:6px;">ΕΚΠΡΟΘΕΣΜΗ</span>`
      : '';
  const completedChip = t.status === 'done' && t.completedAt
    ? `<span style="display:inline-block;font-size:10px;color:${BRAND.success};margin-left:6px;">✓ ${escapeHtml(formatDate(t.completedAt))}</span>`
    : '';
  const hours = t.estimatedHours ? `<span style="color:${BRAND.textDim};font-size:11px;margin-left:6px;">· ${t.estimatedHours}h</span>` : '';

  return `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};vertical-align:top;width:60%;">
        <div style="font-size:13px;font-weight:600;color:${BRAND.text};line-height:1.4;">
          ${escapeHtml(t.title)}${overdueChip}${completedChip}
        </div>
        ${
          t.description?.trim()
            ? `<div style="font-size:11px;color:${BRAND.textSoft};margin-top:4px;line-height:1.5;">${escapeHtml(truncate(t.description, 220))}</div>`
            : ''
        }
        ${
          assignees
            ? `<div style="font-size:11px;color:${BRAND.textDim};margin-top:6px;">👤 ${escapeHtml(assignees)}</div>`
            : ''
        }
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};vertical-align:top;font-size:12px;color:${BRAND.text};white-space:nowrap;">
        ${priorityPill(t.priority)}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};vertical-align:top;font-size:12px;color:${BRAND.text};white-space:nowrap;">
        ${escapeHtml(due)}${hours}
      </td>
    </tr>`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function statusSection(
  status: keyof typeof STATUS_LABEL,
  tasks: NonNullable<ProjectReportData>['tasks'],
): string {
  const list = tasks.filter((t) => t.status === status);
  if (list.length === 0) return '';
  return `
    ${sectionHeader({ label: STATUS_LABEL[status], color: STATUS_COLOR[status], count: list.length })}
    <table role="presentation" style="border-collapse:collapse;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:${BRAND.bg};">
          <th align="left" style="padding:8px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.textDim};border-bottom:1px solid ${BRAND.border};">Εργασία</th>
          <th align="left" style="padding:8px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.textDim};border-bottom:1px solid ${BRAND.border};">Προτεραιότητα</th>
          <th align="left" style="padding:8px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.textDim};border-bottom:1px solid ${BRAND.border};">Λήξη</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(taskRowHtml).join('')}
      </tbody>
    </table>`;
}

function membersBlock(project: NonNullable<ProjectReportData>): string {
  const owner = project.owner;
  const others = project.members.filter((m) => m.userId !== project.ownerId);
  if (!owner && others.length === 0) return '';

  const lines: string[] = [];
  if (owner) {
    lines.push(
      personRow({
        name: owner.name ?? owner.email,
        email: owner.email,
        badge: { label: 'OWNER', color: BRAND.primary },
      }),
    );
  }
  for (const m of others) {
    lines.push(personRow({ name: m.user.name ?? m.user.email, email: m.user.email }));
  }

  return `
    <div style="margin:24px 0 0;">
      <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${BRAND.textDim};margin:0 0 10px;">Ομάδα έργου</h3>
      ${infoCard(lines.join(''))}
    </div>`;
}

export type BuildProjectReportInput = {
  project: NonNullable<ProjectReportData>;
  recipientName?: string;
  coverMessage?: string;
  senderName?: string;
};

export function buildProjectReportHtml({
  project,
  recipientName,
  coverMessage,
  senderName,
}: BuildProjectReportInput): string {
  const tasks = project.tasks;
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const overdue = tasks.filter(
    (t) => t.status !== 'done' && t.dueDate && t.dueDate.getTime() < Date.now(),
  ).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const totalHours = tasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);
  const remainingHours = tasks
    .filter((t) => t.status !== 'done')
    .reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);

  const today = new Date();
  const dueLine = project.dueDate
    ? `<span style="color:${BRAND.textSoft};">Προθεσμία: <strong style="color:${BRAND.text};">${escapeHtml(formatDate(project.dueDate))}</strong> (${escapeHtml(daysAwayLabel(project.dueDate, today))})</span>`
    : '';

  const meta: Array<{ label: string; value: string }> = [
    { label: 'Κατάσταση έργου', value: PROJECT_STATUS_LABEL[project.status] ?? project.status },
    { label: 'Έναρξη', value: formatDate(project.startDate) },
    { label: 'Λήξη', value: formatDate(project.dueDate) },
    { label: 'Ιδιοκτήτης', value: project.owner ? escapeHtml(project.owner.name ?? project.owner.email) : '—' },
    {
      label: 'Δημιουργήθηκε',
      value: formatDate(project.createdAt),
    },
    {
      label: 'Τελευταία ενημέρωση',
      value: formatDate(project.updatedAt),
    },
  ];

  const cover = coverMessage?.trim()
    ? `
      <div style="margin:0 0 20px;padding:14px 18px;background:${BRAND.infoBg};border-left:4px solid ${BRAND.info};border-radius:8px;">
        ${
          senderName
            ? `<div style="font-size:11px;color:${BRAND.textSoft};margin-bottom:4px;">Μήνυμα από ${escapeHtml(senderName)}</div>`
            : ''
        }
        <div style="font-size:14px;color:${BRAND.text};line-height:1.55;white-space:pre-wrap;">${escapeHtml(coverMessage)}</div>
      </div>`
    : '';

  const statsRow = statRow([
    { label: 'Σύνολο εργασιών', value: total, tone: 'default' },
    { label: 'Ολοκληρωμένες', value: `${done}/${total}`, tone: 'success' },
    { label: 'Σε εξέλιξη', value: inProgress, tone: 'info' },
    { label: 'Εκπρόθεσμες', value: overdue, tone: overdue > 0 ? 'danger' : 'default' },
  ]);

  const hoursRow = totalHours > 0
    ? `
    <div style="font-size:12px;color:${BRAND.textSoft};margin-bottom:14px;">
      Εκτιμώμενες ώρες: <strong style="color:${BRAND.text};">${totalHours}h</strong>
      &nbsp;·&nbsp; Ολοκληρωμένες: <strong style="color:${BRAND.text};">${(totalHours - remainingHours).toFixed(1)}h</strong>
      &nbsp;·&nbsp; Απομένουν: <strong style="color:${BRAND.text};">${remainingHours}h</strong>
    </div>`
    : '';

  // ─── Estimated vs Actual ─────────────────────────────────────────
  // Sum estimated and actual (wall-clock in_progress) across all tasks.
  const now = new Date();
  const estimatedMs = tasks.reduce(
    (acc, t) => acc + (t.estimatedHours ? t.estimatedHours * 3_600_000 : 0),
    0,
  );
  const spentMs = tasks.reduce(
    (acc, t) =>
      acc + computeSpentMs(t.status, t.inProgressStartedAt, t.inProgressAccumulatedMs, now),
    0,
  );
  const pctOfEstimate = estimatedMs > 0 ? Math.round((spentMs / estimatedMs) * 100) : null;

  const timeBlock =
    spentMs > 0 || estimatedMs > 0
      ? `
        ${sectionHeader({ label: 'Χρόνος εργασίας', color: BRAND.primary })}
        ${statRow([
          {
            label: 'Εκτίμηση',
            value: estimatedMs > 0 ? formatSpent(estimatedMs) : '—',
            tone: 'default',
          },
          {
            label: 'Πραγματικός',
            value: spentMs > 0 ? formatSpent(spentMs) : '—',
            tone: 'info',
          },
          ...(pctOfEstimate !== null
            ? [
                {
                  label: '% εκτίμησης',
                  value: `${pctOfEstimate}%`,
                  tone: pctOfEstimate > 100 ? ('danger' as const) : ('success' as const),
                },
              ]
            : []),
        ])}
      `
      : '';

  // ─── Next 7 days focus list ──────────────────────────────────────
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
  const upcoming = tasks
    .filter(
      (t) =>
        t.status !== 'done' &&
        t.dueDate &&
        t.dueDate.getTime() >= now.getTime() &&
        t.dueDate.getTime() <= sevenDaysFromNow.getTime(),
    )
    .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))
    .slice(0, 8);

  const upcomingBlock =
    upcoming.length > 0
      ? `
        ${sectionHeader({ label: 'Επόμενες 7 ημέρες', color: BRAND.warning, count: upcoming.length })}
        <table role="presentation" style="border-collapse:collapse;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;margin-bottom:18px;">
          <tbody>
            ${upcoming.map(taskRowHtml).join('')}
          </tbody>
        </table>
      `
      : '';

  // ─── Recently completed (last 7 days) ────────────────────────────
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const recentlyDone = tasks
    .filter((t) => t.status === 'done' && t.completedAt && t.completedAt.getTime() >= sevenDaysAgo.getTime())
    .sort((a, b) => (b.completedAt!.getTime() - a.completedAt!.getTime()))
    .slice(0, 8);

  const recentlyDoneBlock =
    recentlyDone.length > 0
      ? `
        ${sectionHeader({
          label: 'Πρόσφατα ολοκληρωμένα',
          color: BRAND.success,
          count: recentlyDone.length,
        })}
        <table role="presentation" style="border-collapse:collapse;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;margin-bottom:18px;">
          <tbody>
            ${recentlyDone.map(taskRowHtml).join('')}
          </tbody>
        </table>
      `
      : '';

  // ─── Pending Q&A blockers ────────────────────────────────────────
  const pendingQuestions: Array<{
    taskTitle: string;
    questionText: string;
    askedByName: string;
    askedToName: string;
    daysOpen: number;
  }> = [];
  for (const t of tasks) {
    for (const q of t.questions) {
      const days = Math.max(0, Math.floor((now.getTime() - q.createdAt.getTime()) / 86400000));
      pendingQuestions.push({
        taskTitle: t.title,
        questionText: q.question,
        askedByName: q.askedBy.name ?? q.askedBy.email,
        askedToName: q.askedTo.name ?? q.askedTo.email,
        daysOpen: days,
      });
    }
  }
  pendingQuestions.sort((a, b) => b.daysOpen - a.daysOpen);
  const blockersBlock =
    pendingQuestions.length > 0
      ? `
        ${sectionHeader({
          label: 'Εκκρεμείς ερωτήσεις',
          color: BRAND.warning,
          count: pendingQuestions.length,
        })}
        <table role="presentation" style="border-collapse:collapse;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;margin-bottom:18px;">
          <tbody>
            ${pendingQuestions
              .slice(0, 8)
              .map((q) => {
                const ageChip = q.daysOpen > 0
                  ? `<span style="display:inline-block;font-size:10px;font-weight:700;color:${q.daysOpen > 3 ? 'white' : BRAND.warning};background:${q.daysOpen > 3 ? BRAND.warning : 'transparent'};padding:2px 8px;border-radius:999px;margin-left:6px;${q.daysOpen > 3 ? '' : `border:1px solid ${BRAND.warning};`}">${q.daysOpen}d</span>`
                  : '';
                return `
                  <tr>
                    <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
                      <div style="font-size:11px;color:${BRAND.textDim};margin-bottom:4px;">
                        ${escapeHtml(q.taskTitle)}${ageChip}
                      </div>
                      <div style="font-size:13px;color:${BRAND.text};line-height:1.45;">
                        ${escapeHtml(truncate(q.questionText, 220))}
                      </div>
                      <div style="font-size:11px;color:${BRAND.textSoft};margin-top:6px;">
                        ${escapeHtml(q.askedByName)} → ${escapeHtml(q.askedToName)}
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      `
      : '';

  // ─── Risks and open questions from recent meetings ──────────────
  type RiskItem = { text: string; severity?: 'low' | 'medium' | 'high'; ownerEmail?: string | null };
  const meetingRisks: RiskItem[] = [];
  for (const m of project.meetings ?? []) {
    if (Array.isArray(m.risks)) {
      for (const r of m.risks as RiskItem[]) {
        if (r && typeof r === 'object' && typeof r.text === 'string') meetingRisks.push(r);
      }
    }
  }
  const riskOrder = { high: 0, medium: 1, low: 2 } as const;
  meetingRisks.sort(
    (a, b) => (riskOrder[a.severity ?? 'low'] ?? 3) - (riskOrder[b.severity ?? 'low'] ?? 3),
  );

  const risksBlock =
    meetingRisks.length > 0
      ? `
        ${sectionHeader({ label: 'Κίνδυνοι από συσκέψεις', color: BRAND.danger, count: meetingRisks.length })}
        <table role="presentation" style="border-collapse:collapse;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;margin-bottom:18px;">
          <tbody>
            ${meetingRisks
              .slice(0, 6)
              .map((r) => {
                const sev = r.severity ?? 'low';
                const sevColor = sev === 'high' ? BRAND.danger : sev === 'medium' ? BRAND.warning : BRAND.textDim;
                const sevPill = pill(sev.toUpperCase(), {
                  color: 'white',
                  bg: sevColor,
                  bold: true,
                });
                return `
                  <tr>
                    <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
                      <div style="margin-bottom:4px;">${sevPill}</div>
                      <div style="font-size:13px;color:${BRAND.text};line-height:1.45;">
                        ${escapeHtml(r.text)}
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      `
      : '';

  const sections = STATUS_ORDER.map((s) => statusSection(s, tasks)).join('');

  const statusPill = pill(PROJECT_STATUS_LABEL[project.status] ?? project.status, {
    color: 'white',
    bg: project.status === 'completed' ? BRAND.success : project.status === 'on_hold' ? BRAND.warning : BRAND.primary,
    bold: true,
  });

  const greeting = project.description?.trim()
    ? `<p style="font-size:14px;color:${BRAND.text};line-height:1.55;margin:0 0 16px;">${escapeHtml(project.description)}</p>`
    : '';

  const body = `
    ${cover}
    ${greeting}
    ${dueLine ? `<div style="margin:0 0 12px;font-size:13px;">${dueLine}</div>` : ''}
    ${progressBar(pct, project.color)}
    ${statsRow}
    ${hoursRow}
    ${timeBlock}
    ${upcomingBlock}
    ${blockersBlock}
    ${risksBlock}
    ${recentlyDoneBlock}
    ${metaTable(meta)}
    ${membersBlock(project)}
    ${
      total === 0
        ? `<div style="padding:18px;background:${BRAND.bg};border:1px dashed ${BRAND.border};border-radius:10px;text-align:center;color:${BRAND.textSoft};font-size:13px;margin-top:18px;">Δεν έχουν δημιουργηθεί ακόμη εργασίες σε αυτό το έργο.</div>`
        : sections
    }
  `;

  const projectUrl = appUrl(`/projects/${project.id}`);
  const actions: ActionButton[] = projectUrl
    ? [{ label: 'Άνοιγμα στο A-Sisyphus', url: projectUrl, variant: 'primary' }]
    : [];

  return emailLayout({
    recipientName,
    header: {
      kicker: { text: '📊 Αναφορά προόδου έργου', tone: 'info' },
      eyebrow: { text: project.name, color: project.color },
      title: project.name,
      pillsHtml: statusPill,
    },
    body,
    actions,
    footerNote: senderName
      ? `Στάλθηκε από ${senderName} · ${formatGreekDateTime(today)}`
      : `Δημιουργήθηκε στις ${formatGreekDateTime(today)}`,
  });
}

function daysAwayLabel(date: Date, ref: Date): string {
  const days = dayDiff(date, ref);
  if (days === 0) return 'σήμερα';
  if (days > 0) return `σε ${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`;
  const past = -days;
  return `${past} ${past === 1 ? 'ημέρα' : 'ημέρες'} πριν`;
}
