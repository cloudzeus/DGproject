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
