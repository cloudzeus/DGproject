import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  STATUS_LABELS_EL,
  PRIORITY_LABELS_EL,
} from '@/lib/reports';

const BLUE_FILL = 'FF0078D4';
const LIGHT_FILL = 'FFF3F2F1';
const BORDER = { style: 'thin' as const, color: { argb: 'FFE1E1E1' } };

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 60) || 'project';
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
  });
  row.height = 22;
}

function styleRow(row: ExcelJS.Row, zebra: boolean) {
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_FILL } };
  });
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toLocaleString('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const uid = session.user.id;
  const role = session.user.role;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
      tasks: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: {
          assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
          creator: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const canView =
    role === 'admin' ||
    role === 'manager' ||
    project.ownerId === uid ||
    project.members.some((m) => m.userId === uid);
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'A-Sisyphus';
  wb.created = new Date();
  wb.title = `Αναφορά: ${project.name}`;

  // ───── Sheet 1: Project overview ─────
  const overview = wb.addWorksheet('Έργο');
  overview.columns = [
    { header: 'Πεδίο', key: 'field', width: 28 },
    { header: 'Τιμή', key: 'value', width: 60 },
  ];
  styleHeader(overview.getRow(1));

  const doneTasks = project.tasks.filter((t) => t.status === 'done');
  const now = new Date();
  const overdueTasks = project.tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'done');
  const totalEstimated = project.tasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const doneEstimated = doneTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);

  const summary: Array<[string, string]> = [
    ['Όνομα', project.name],
    ['Περιγραφή', project.description ?? ''],
    ['Κατάσταση', STATUS_LABELS_EL[project.status] ?? project.status],
    ['Ιδιοκτήτης', project.owner.name ?? project.owner.email],
    ['Ημερομηνία έναρξης', project.startDate ? formatDate(project.startDate) : '—'],
    ['Ημερομηνία λήξης', project.dueDate ? formatDate(project.dueDate) : '—'],
    ['Πρόοδος (%)', String(project.progress)],
    ['Σύνολο εργασιών', String(project.tasks.length)],
    ['Ολοκληρωμένες', String(doneTasks.length)],
    ['Εκπρόθεσμες', String(overdueTasks.length)],
    ['Μέλη', String(project.members.length)],
    ['Συν. εκτιμ. ώρες', totalEstimated.toFixed(2)],
    ['Εκτιμ. ώρες ολοκληρωμένων', doneEstimated.toFixed(2)],
    ['Δημιουργήθηκε', formatDate(project.createdAt)],
    ['Τελευταία ενημέρωση', formatDate(project.updatedAt)],
  ];
  summary.forEach(([k, v], i) => {
    const r = overview.addRow([k, v]);
    styleRow(r, i % 2 === 1);
    r.getCell('field').font = { bold: true };
  });
  overview.views = [{ state: 'frozen', ySplit: 1 }];

  // ───── Sheet 2: Tasks ─────
  const tasksSheet = wb.addWorksheet('Εργασίες');
  tasksSheet.columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'Τίτλος', key: 'title', width: 36 },
    { header: 'Κατάσταση', key: 'status', width: 18 },
    { header: 'Προτεραιότητα', key: 'priority', width: 16 },
    { header: 'Έναρξη', key: 'startDate', width: 20 },
    { header: 'Λήξη', key: 'dueDate', width: 20 },
    { header: 'Ολοκληρώθηκε', key: 'completedAt', width: 20 },
    { header: 'Εκτιμ. ώρες', key: 'estimatedHours', width: 14 },
    { header: 'Ανάθεση σε', key: 'assignees', width: 40 },
    { header: 'Δημιουργός', key: 'creator', width: 28 },
    { header: 'Περιγραφή', key: 'description', width: 60 },
  ];
  styleHeader(tasksSheet.getRow(1));

  project.tasks.forEach((t, i) => {
    const r = tasksSheet.addRow({
      num: i + 1,
      title: t.title,
      status: STATUS_LABELS_EL[t.status] ?? t.status,
      priority: PRIORITY_LABELS_EL[t.priority] ?? t.priority,
      startDate: formatDate(t.startDate),
      dueDate: formatDate(t.dueDate),
      completedAt: formatDate(t.completedAt),
      estimatedHours: t.estimatedHours ?? '',
      assignees: t.assignees.map((a) => a.user.name ?? a.user.email).join(', '),
      creator: t.creator.name ?? t.creator.email,
      description: t.description ?? '',
    });
    styleRow(r, i % 2 === 1);
    if (t.dueDate && t.dueDate < now && t.status !== 'done') {
      r.getCell('dueDate').font = { color: { argb: 'FFC50F1F' }, bold: true };
    }
    if (t.status === 'done') {
      r.getCell('status').font = { color: { argb: 'FF107C10' }, bold: true };
    }
  });
  tasksSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ───── Sheet 3: Members / Workload ─────
  const membersSheet = wb.addWorksheet('Μέλη & Φόρτος');
  membersSheet.columns = [
    { header: 'Όνομα', key: 'name', width: 30 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Ρόλος', key: 'role', width: 18 },
    { header: 'Σύνολο εργασιών', key: 'total', width: 16 },
    { header: 'Ανοιχτές', key: 'open', width: 12 },
    { header: 'Σε εξέλιξη', key: 'inProgress', width: 14 },
    { header: 'Ολοκληρ.', key: 'done', width: 12 },
    { header: 'Εκπρόθεσμες', key: 'overdue', width: 14 },
    { header: 'Συν. εκτιμ. ώρες', key: 'hours', width: 16 },
  ];
  styleHeader(membersSheet.getRow(1));

  const roleLabels: Record<string, string> = {
    admin: 'Διαχειριστής',
    manager: 'Διευθυντής',
    member: 'Μέλος',
    viewer: 'Προβολή',
  };

  project.members.forEach((m, i) => {
    const userTasks = project.tasks.filter((t) =>
      t.assignees.some((a) => a.userId === m.userId),
    );
    const doneCount = userTasks.filter((t) => t.status === 'done').length;
    const inProgress = userTasks.filter((t) => t.status === 'in_progress').length;
    const overdue = userTasks.filter(
      (t) => t.dueDate && t.dueDate < now && t.status !== 'done',
    ).length;
    const hours = userTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
    const r = membersSheet.addRow({
      name: m.user.name ?? m.user.email,
      email: m.user.email,
      role: roleLabels[m.user.role] ?? m.user.role,
      total: userTasks.length,
      open: userTasks.length - doneCount,
      inProgress,
      done: doneCount,
      overdue,
      hours: hours.toFixed(2),
    });
    styleRow(r, i % 2 === 1);
    if (overdue > 0) {
      r.getCell('overdue').font = { color: { argb: 'FFC50F1F' }, bold: true };
    }
  });
  membersSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const ab = await wb.xlsx.writeBuffer();
  const buf = Buffer.from(ab as ArrayBuffer);
  const filename = `project-${safeFilename(project.name)}-${todayStamp()}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
